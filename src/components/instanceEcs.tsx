import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three/webgpu";

// ---------------------------------------------------------------------------
// Shared temporaries (module-level, avoids GC pressure)
// ---------------------------------------------------------------------------

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();

// ---------------------------------------------------------------------------
// InstancedEntity
// ---------------------------------------------------------------------------

export class InstancedEntity {
  /** @internal */ _index: number;
  /** @internal */ _pool: InstancePool;
  /** @internal */ _removed: boolean;

  readonly position: THREE.Vector3;
  readonly rotation: THREE.Euler;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;

  // Allow arbitrary user data (velocity, currentTime, etc.)
  [key: string]: unknown;

  constructor(pool: InstancePool, index: number) {
    this._pool = pool;
    this._index = index;
    this._removed = false;
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3(1, 1, 1);
  }

  /** Compose position/rotation/scale into a Matrix4 and write it to the
   *  instance matrix buffer at this entity's current index.
   *  Note: Uses quaternion directly. If you modify rotation (Euler), you must
   *  manually sync it with quaternion.setFromEuler(this.rotation). */
  updateMatrix(): void {
    _mat4.compose(this.position, this.quaternion, this.scale);
    this._pool._mesh.setMatrixAt(this._index, _mat4);
  }

  /** Mark this entity for removal. Actual removal (swap-and-pop) happens at
   *  the end of the next `updateInstances` call. */
  remove(): void {
    this._removed = true;
  }
}

// ---------------------------------------------------------------------------
// InstancePool
// ---------------------------------------------------------------------------

const DEFAULT_CAPACITY = 128;
const GROW_FACTOR = 2;

export class InstancePool {
  /** @internal */ _mesh: THREE.InstancedMesh;
  /** Current buffer capacity. Grows automatically when exceeded. */
  capacity: number;
  activeCount: number;
  /** @internal */ _entities: (InstancedEntity | null)[];

  constructor(mesh: THREE.InstancedMesh, capacity?: number) {
    this._mesh = mesh;
    this.capacity = capacity ?? mesh.count ?? DEFAULT_CAPACITY;
    this.activeCount = 0;
    this._entities = new Array<InstancedEntity | null>(this.capacity).fill(
      null,
    );

    // Start with nothing visible
    mesh.count = 0;
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Allocate `count` new instances at the end of the active range.
   * If the buffer is too small, it grows automatically.
   */
  addInstances(
    count: number,
    setup: (entity: InstancedEntity, index: number) => void,
  ): void {
    const needed = this.activeCount + count;
    if (needed > this.capacity) {
      this._grow(needed);
    }

    for (let i = this.activeCount; i < needed; i++) {
      const entity = new InstancedEntity(this, i);
      this._entities[i] = entity;
      setup(entity, i - this.activeCount);
      entity.updateMatrix();
    }

    this.activeCount = needed;
    this._mesh.count = this.activeCount;
    this._mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Iterate all active entities with `callback`, then process deferred
   * removals (swap-and-pop) and auto-call `updateMatrix()` on surviving
   * entities.
   *
   * Two-phase design:
   *  1. Forward pass — user callback on every active entity.
   *  2. Backward pass — removals + matrix writes.
   *
   * Backward iteration in phase 2 ensures swapped-in entities are not
   * skipped.
   */
  updateInstances(
    callback: (entity: InstancedEntity, index: number) => void,
  ): void {
    // Phase 1: user logic
    for (let i = 0; i < this.activeCount; i++) {
      callback(this._entities[i]!, i);
    }

    // Phase 2: removals + matrix writes (iterate backward)
    for (let i = this.activeCount - 1; i >= 0; i--) {
      const entity = this._entities[i]!;
      if (entity._removed) {
        this._swapRemove(i);
      } else {
        entity.updateMatrix();
      }
    }

    this._mesh.count = this.activeCount;
    this._mesh.instanceMatrix.needsUpdate = true;
  }

  /** Remove all active instances. */
  clear(): void {
    for (let i = 0; i < this.activeCount; i++) {
      this._entities[i] = null;
    }
    this.activeCount = 0;
    this._mesh.count = 0;
    this._mesh.instanceMatrix.needsUpdate = true;
  }

  // ---- Internal -----------------------------------------------------------

  /** @internal Swap entity at `index` with the last active entity, then
   *  shrink activeCount by 1. */
  private _swapRemove(index: number): void {
    const lastIndex = this.activeCount - 1;

    if (index !== lastIndex) {
      const lastEntity = this._entities[lastIndex]!;
      lastEntity._index = index;
      this._entities[index] = lastEntity;
      lastEntity.updateMatrix(); // re-write matrix at the new index
    }

    this._entities[lastIndex] = null;
    this.activeCount--;
  }

  /** @internal Grow the underlying InstancedMesh buffer and entity array. */
  private _grow(minCapacity: number): void {
    let newCapacity = this.capacity || DEFAULT_CAPACITY;
    while (newCapacity < minCapacity) {
      newCapacity *= GROW_FACTOR;
    }

    const mesh = this._mesh;

    // Resize the InstancedMesh — Three.js r149+ supports resize()
    // but for broader compat we rebuild the instanceMatrix buffer.
    const oldArray = mesh.instanceMatrix.array as Float32Array;
    const newArray = new Float32Array(newCapacity * 16);
    newArray.set(oldArray); // copy existing data

    // Fill new slots with identity matrices
    const identity = new THREE.Matrix4();
    const identityElements = identity.elements;
    for (let i = this.capacity; i < newCapacity; i++) {
      newArray.set(identityElements, i * 16);
    }

    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(newArray, 16);
    mesh.instanceMatrix.needsUpdate = true;

    // Grow the entity array
    const newEntities = new Array<InstancedEntity | null>(newCapacity).fill(
      null,
    );
    for (let i = 0; i < this.activeCount; i++) {
      newEntities[i] = this._entities[i];
    }
    this._entities = newEntities;

    this.capacity = newCapacity;
  }
}

// ---------------------------------------------------------------------------
// Hook: attach a pool to any InstancedMesh ref
// ---------------------------------------------------------------------------

/**
 * Attach an InstancePool to an existing `<instancedMesh>` ref.
 *
 * ```tsx
 * const meshRef = useRef<THREE.InstancedMesh>(null!)
 * const pool = useInstancedMesh2(meshRef)
 *
 * useFrame((_, delta) => {
 *   pool.current.addInstances(1, (obj) => { ... })
 *   pool.current.updateInstances((obj) => { ... })
 * })
 *
 * return (
 *   <instancedMesh ref={meshRef} args={[geometry, material, 100]}>
 *     ...
 *   </instancedMesh>
 * )
 * ```
 */
export function useInstancedMesh2(
  meshRef: React.RefObject<THREE.InstancedMesh | null>,
): React.RefObject<InstancePool | null> {
  const poolRef = useRef<InstancePool | null>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    poolRef.current = new InstancePool(mesh);
    return () => {
      poolRef.current = null;
    };
  }, [meshRef]);

  return poolRef;
}

export interface InstancesRef {
  addInstances: (
    count: number,
    setup: (entity: InstancedEntity, index: number) => void,
  ) => void;
  updateInstances: (
    callback: (entity: InstancedEntity, index: number) => void,
  ) => void;
  clear: () => void;
  readonly activeCount: number;
  readonly mesh: THREE.InstancedMesh;
}

export interface InstancesProps {
  /** Pass [geometry, material, count] to set the mesh directly, similar to <instancedMesh args={...}>. */
  args?: [THREE.BufferGeometry, THREE.Material, number];
  maxInstances?: number;
  frustumCulled?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  children?: React.ReactNode;
}

/**
 * Declarative R3F wrapper around InstancedMesh with a pool-based API.
 *
 * Option A — declarative children:
 * ```tsx
 * <Instances ref={ref} maxInstances={1000}>
 *   <sphereGeometry args={[0.1, 16, 16]} />
 *   <meshStandardNodeMaterial color="hotpink" />
 * </Instances>
 * ```
 *
 * Option B — use the hook with your own instancedMesh:
 * ```tsx
 * const meshRef = useRef(null!)
 * const pool = useInstancedMesh2(meshRef)
 * <instancedMesh ref={meshRef} args={[geometry, material, 100]} />
 * ```
 */
export const Instances = forwardRef<InstancesRef, InstancesProps>(
  function Instances(
    {
      args,
      maxInstances,
      frustumCulled = false,
      castShadow = false,
      receiveShadow = false,
      children,
    },
    ref,
  ) {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const poolRef = useRef<InstancePool | null>(null);

    const initialCapacity = args?.[2] ?? maxInstances ?? DEFAULT_CAPACITY;
    const geometry = args?.[0];
    const material = args?.[1];

    useEffect(() => {
      const mesh = meshRef.current;
      if (!mesh) return;

      const identity = new THREE.Matrix4();
      for (let i = 0; i < initialCapacity; i++) {
        mesh.setMatrixAt(i, identity);
      }
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;

      poolRef.current = new InstancePool(mesh, initialCapacity);

      return () => {
        poolRef.current = null;
      };
    }, [initialCapacity]);

    useImperativeHandle(
      ref,
      () => ({
        addInstances(count, setup) {
          poolRef.current?.addInstances(count, setup);
        },
        updateInstances(callback) {
          poolRef.current?.updateInstances(callback);
        },
        clear() {
          poolRef.current?.clear();
        },
        get activeCount() {
          return poolRef.current?.activeCount ?? 0;
        },
        get mesh() {
          return meshRef.current;
        },
      }),
      [],
    );

    return (
      <instancedMesh
        ref={meshRef}
        args={[geometry ?? undefined!, material ?? undefined!, initialCapacity]}
        frustumCulled={frustumCulled}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
      >
        {children}
      </instancedMesh>
    );
  },
);