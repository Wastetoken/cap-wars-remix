import * as THREE from 'three'

const NEW_KNIGHT_MESH_TO_TARGET: Record<string, string> = {
  Knight_ArmLeft: 'upperarm.l',
  Knight_ArmRight: 'upperarm.r',
  Knight_Body: 'chest',
  Knight_Head: 'head',
  Knight_LegLeft: 'upperleg.l',
  Knight_LegRight: 'upperleg.r',
  Knight_Helmet: 'Knight_Helmet',
  Knight_Cape: 'Knight_Cape',
  '1H_Sword': '1H_Sword',
  '1H_Sword_Offhand': '1H_Sword_Offhand',
  '2H_Sword': '2H_Sword',
  Badge_Shield: 'Badge_Shield',
  Rectangle_Shield: 'Rectangle_Shield',
  Round_Shield: 'Round_Shield',
  Spike_Shield: 'Spike_Shield',
}

export const mergeKnightWithLegacyRig = (
  newScene: THREE.Object3D,
  legacyScene: THREE.Object3D
): { clone: THREE.Group; animations: THREE.AnimationClip[] } => {
  const clone = legacyScene.clone(true)

  const legacyNodes = new Map<string, THREE.Object3D>()
  const legacyBones = new Map<string, THREE.Bone>()
  clone.traverse((obj) => {
    legacyNodes.set(obj.name, obj)
    if (obj.isBone) legacyBones.set(obj.name, obj)
  })

  newScene.traverse((child) => {
    if (!child.isMesh) return
    const rawName = child.name.replace(/_n3d$/, '')
    const targetName = NEW_KNIGHT_MESH_TO_TARGET[rawName]
    if (!targetName) return

    const target = legacyNodes.get(targetName) || legacyBones.get(targetName)
    if (!target) return

    const newMesh = child.clone(true) as THREE.Mesh
    newMesh.material = Array.isArray(newMesh.material)
      ? newMesh.material.map((m) => m.clone())
      : newMesh.material.clone()

    if (!target.isBone) {
      target.traverse((obj) => {
        if (obj.isMesh) obj.visible = false
      })
    }

    target.attach(newMesh)
  })

  return { clone, animations: (legacyScene as any).animations || [] }
}
