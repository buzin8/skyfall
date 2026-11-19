import * as THREE from 'three';
import { Team } from '../types';

export type AgentVisualStyle = 'ember' | 'duelist' | 'striker' | 'sentinel';

export interface AgentRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  leftFoot: THREE.Group;
  rightFoot: THREE.Group;
  weaponPivot: THREE.Group;
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Group;
  blindHalo: THREE.Mesh;
  hitMeshes: THREE.Mesh[];
  flashMaterials: THREE.MeshStandardMaterial[];
}

/**
 * Smooth, multi-joint articulated tactical soldier rig with capsule anatomy,
 * real hip/knee/ankle articulation, and accurate head hitbox at y ≈ 1.67.
 * - Ally (`team === 'ally'`): Cobalt/sky-blue tactical uniform, blue helmet with dark visor, black rig, wood-stock AK.
 * - Enemy (`team === 'enemy'`): Olive/grey helmet with goggles, olive gaiter, brown/charcoal vest, short-sleeve dark shirt, denim jeans, AK rifle.
 */
export function buildAgentRig(
  agentId: string,
  team: Team,
  style: AgentVisualStyle
): AgentRig {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.94;
  root.add(hips);

  const hitMeshes: THREE.Mesh[] = [];
  const flashMaterials: THREE.MeshStandardMaterial[] = [];

  const isAlly = team === 'ally';

  const mkMat = (color: number, roughness = 0.82, metalness = 0.06) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.16,
      envMapIntensity: 1.15,
    });
    flashMaterials.push(m);
    return m;
  };

  const shirtColor = isAlly
    ? 0x2673d6
    : style === 'sentinel'
    ? 0x26292d
    : style === 'striker'
    ? 0x2c2725
    : 0x222528;

  const pantsColor = isAlly
    ? 0x1e60ba
    : style === 'sentinel'
    ? 0x304d73
    : 0x3b5d88;

  const vestColor = isAlly
    ? 0x1a1e24
    : style === 'striker'
    ? 0x3e2d22
    : 0x322924;

  const helmetColor = isAlly
    ? 0x2266c4
    : style === 'sentinel'
    ? 0x5d625c
    : 0x5a654d;

  const matShirt = mkMat(shirtColor, 0.84, 0.04);
  const matPants = mkMat(pantsColor, 0.88, 0.03);
  const matVest = mkMat(vestColor, 0.76, 0.09);
  const matHelmet = mkMat(helmetColor, 0.58, 0.16);
  const matSkin = mkMat(isAlly ? 0xd9a98b : 0xd09e7c, 0.72, 0.02);
  const matGaiter = mkMat(0x4a593d, 0.88, 0.02);
  const matBoot = mkMat(0x1e1b1a, 0.7, 0.14);
  const matKneePad = mkMat(0x181b20, 0.54, 0.2);
  const matGlove = mkMat(0x1d2025, 0.76, 0.1);
  const matGoggleFrame = new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.52, metalness: 0.28 });
  const matGoggleLens = new THREE.MeshStandardMaterial({
    color: 0x131b24,
    roughness: 0.12,
    metalness: 0.7,
    envMapIntensity: 1.6,
  });
  const matGunSteel = new THREE.MeshStandardMaterial({
    color: 0x24282e,
    roughness: 0.38,
    metalness: 0.78,
  });
  const matGunWood = new THREE.MeshStandardMaterial({
    color: 0x7a4726,
    roughness: 0.62,
    metalness: 0.08,
  });

  const registerHit = (mesh: THREE.Mesh, zone: 'head' | 'body' | 'leg') => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.agentId = agentId;
    mesh.userData.hitZone = zone;
    mesh.userData.team = team;
    hitMeshes.push(mesh);
    return mesh;
  };

  // ===== MULTI-JOINT ARTICULATED LEGS (Hip -> Thigh -> Knee -> Shin -> Ankle -> Boot) =====
  const buildLeg = (
    side: number
  ): { hipPivot: THREE.Group; kneePivot: THREE.Group; footPivot: THREE.Group } => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.12, 0, 0);

    // Smooth capsule upper thigh (eliminates boxy Minecraft look!)
    const thigh = registerHit(new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.27, 6, 10), matPants), 'leg');
    thigh.position.y = -0.215;
    hipPivot.add(thigh);

    if (isAlly) {
      // Tactical thigh cargo pouch + leg holster strap
      const pocket = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.09, 4, 8), matPants);
      pocket.scale.set(0.65, 1, 1.35);
      pocket.position.set(side * 0.078, -0.22, 0);
      hipPivot.add(pocket);

      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.01, 5, 12), matKneePad);
      strap.rotation.x = Math.PI / 2;
      strap.position.y = -0.2;
      hipPivot.add(strap);
    }

    // Articulated Knee Joint
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.43, 0);
    hipPivot.add(kneePivot);

    // Rounded knee cap / ballistic knee pad
    const kneeJointMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.076, 8, 8),
      isAlly ? matKneePad : matPants
    );
    kneeJointMesh.scale.set(0.95, 1.05, 1.05);
    kneeJointMesh.position.z = isAlly ? 0.022 : 0.005;
    kneePivot.add(kneeJointMesh);

    // Smooth capsule lower shin/calf
    const shin = registerHit(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.27, 6, 10), matPants), 'leg');
    shin.position.y = -0.21;
    kneePivot.add(shin);

    // Articulated Ankle / Boot Joint
    const footPivot = new THREE.Group();
    footPivot.position.set(0, -0.42, 0);
    kneePivot.add(footPivot);

    const bootCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.064, 0.11, 10), matBoot);
    bootCollar.position.y = 0.02;
    footPivot.add(bootCollar);

    const bootBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.14, 5, 8), matBoot);
    bootBody.rotation.x = Math.PI / 2;
    bootBody.scale.set(1.12, 1.0, 0.85);
    bootBody.position.set(0, -0.045, 0.06);
    bootBody.castShadow = true;
    footPivot.add(bootBody);

    return { hipPivot, kneePivot, footPivot };
  };

  // Anatomical left is +X and anatomical right is -X when facing +Z
  const leftLegBuilt = buildLeg(1);
  const rightLegBuilt = buildLeg(-1);
  hips.add(leftLegBuilt.hipPivot);
  hips.add(rightLegBuilt.hipPivot);

  // Rounded athletic pelvis & duty belt
  const pelvis = registerHit(new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.14, 6, 10), matPants), 'body');
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(0.75, 1, 0.85);
  pelvis.position.y = 0.02;
  hips.add(pelvis);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.19, 0.065, 12), matBoot);
  belt.scale.set(1.06, 1, 0.72);
  belt.position.y = 0.075;
  hips.add(belt);

  // ===== SCULPTED ORGANIC TORSO & TACTICAL PLATE CARRIER =====
  const torso = new THREE.Group();
  torso.position.y = 0.08; // World y = 1.02
  hips.add(torso);

  // Tapered athletic chest/waist cylinder (V-taper soldier build!)
  const chestCore = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.165, 0.48, 12), matShirt), 'body');
  chestCore.scale.set(1.08, 1, 0.66);
  chestCore.position.y = 0.25;
  torso.add(chestCore);

  // Contoured tactical vest / plate carrier wrapping torso
  const vestFront = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.222, 0.185, 0.37, 12), matVest), 'body');
  vestFront.scale.set(1.06, 1, 0.74);
  vestFront.position.set(0, 0.26, 0.006);
  torso.add(vestFront);

  // Front armored sternum plate + 3 rounded tactical mag pouches
  const sternumPlate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.055), matVest);
  sternumPlate.position.set(0, 0.32, 0.145);
  torso.add(sternumPlate);

  for (const px of [-0.1, 0, 0.1]) {
    const pouch = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.075, 4, 8), matVest);
    pouch.scale.set(1.05, 1, 0.72);
    pouch.position.set(px, 0.175, 0.168);
    torso.add(pouch);
  }

  // Vest shoulder straps
  for (const sx of [-0.125, 0.125]) {
    const strap = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.09, 4, 8), matVest);
    strap.rotation.x = Math.PI / 2;
    strap.scale.set(1, 1.4, 0.55);
    strap.position.set(sx, 0.47, 0);
    torso.add(strap);
  }

  // Compact tactical pack on back
  const backPack = registerHit(new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.14, 5, 8), matVest), 'body');
  backPack.scale.set(1.18, 1.0, 0.62);
  backPack.position.set(0, 0.28, -0.175);
  torso.add(backPack);

  // Smooth shirt collar & deltoid shoulder caps
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.125, 0.085, 10), matShirt);
  collar.position.set(0, 0.49, 0);
  torso.add(collar);

  for (const sx of [-1, 1]) {
    const deltoid = registerHit(new THREE.Mesh(new THREE.SphereGeometry(0.102, 10, 8), matShirt), 'body');
    deltoid.scale.set(1.0, 1.08, 0.96);
    deltoid.position.set(sx * 0.235, 0.41, 0);
    torso.add(deltoid);
  }

  // ===== HEAD, HELMET, GOGGLES & FACE MASK (center y ≈ 1.67) =====
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.5, 0);
  torso.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.066, 0.095, 10), isAlly ? matSkin : matGaiter);
  neck.position.y = 0.03;
  headGroup.add(neck);

  // Head hitbox centered at y = 0.15 -> exact world y = 1.67
  const headBase = registerHit(new THREE.Mesh(new THREE.SphereGeometry(0.126, 12, 10), matSkin), 'head');
  headBase.scale.set(0.9, 1.08, 0.98);
  headBase.position.y = 0.15;
  headGroup.add(headBase);

  const helmetDome = registerHit(
    new THREE.Mesh(new THREE.SphereGeometry(0.148, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), matHelmet),
    'head'
  );
  helmetDome.position.set(0, 0.175, -0.008);
  helmetDome.rotation.x = -0.1;
  headGroup.add(helmetDome);

  const helmetRim = new THREE.Mesh(new THREE.CylinderGeometry(0.146, 0.152, 0.062, 14, 1, true), matHelmet);
  helmetRim.position.set(0, 0.165, -0.01);
  headGroup.add(helmetRim);

  if (isAlly) {
    const gogglesFrame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.068, 0.068), matGoggleFrame);
    gogglesFrame.position.set(0, 0.172, 0.1);
    headGroup.add(gogglesFrame);

    const visorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.184, 0.052, 0.032), matGoggleLens);
    visorGlass.position.set(0, 0.172, 0.125);
    headGroup.add(visorGlass);

    const chinStrap = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.009, 6, 12, Math.PI), matGoggleFrame);
    chinStrap.rotation.x = Math.PI * 0.72;
    chinStrap.position.set(0, 0.09, 0.02);
    headGroup.add(chinStrap);
  } else {
    const goggleBand = new THREE.Mesh(new THREE.CylinderGeometry(0.144, 0.144, 0.032, 14), matGoggleFrame);
    goggleBand.position.set(0, 0.205, -0.004);
    headGroup.add(goggleBand);

    for (const gx of [-0.046, 0.046]) {
      const gRim = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.056, 0.052), matGoggleFrame);
      gRim.position.set(gx, 0.205, 0.12);
      headGroup.add(gRim);
      const gLens = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.042, 0.024), matGoggleLens);
      gLens.position.set(gx, 0.205, 0.143);
      headGroup.add(gLens);
    }

    const gaiter = new THREE.Mesh(new THREE.CylinderGeometry(0.114, 0.104, 0.135, 12), matGaiter);
    gaiter.position.set(0, 0.085, 0.016);
    headGroup.add(gaiter);
  }

  const blindHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.022, 8, 18),
    new THREE.MeshBasicMaterial({ color: 0xffe46b, transparent: true, opacity: 0.92 })
  );
  blindHalo.rotation.x = Math.PI / 2;
  blindHalo.position.set(0, 0.36, 0);
  blindHalo.visible = false;
  headGroup.add(blindHalo);

  // ===== ARTICULATED TWO-HANDED CAPSULE ARMS & WOOD-STOCK AK RIFLE (Right-Handed, Seamless Shoulder->Elbow->Hand) =====
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(-0.14, 0.35, 0.08);
  torso.add(weaponPivot);

  const forearmMat = isAlly ? matShirt : matSkin;
  const UP_AXIS = new THREE.Vector3(0, 1, 0);

  // Exact point-to-point capsule builder guarantees zero gaps at shoulders, elbows, and wrists
  const addArmSegment = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    mat: THREE.Material,
    register = true
  ) => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    const cylLen = Math.max(0.02, dist - radius * 1.35);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, cylLen, 5, 8), mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP_AXIS, dir.normalize());
    if (register) registerHit(mesh, 'body');
    weaponPivot.add(mesh);
  };

  // Shoulder sockets expressed in weaponPivot local space (torso deltoids are at (±0.235, 0.41, 0))
  const rShoulder = new THREE.Vector3(-0.095, 0.055, -0.075); // Right shoulder (-X)
  const rElbow = new THREE.Vector3(-0.14, -0.06, 0.14);
  const rWrist = new THREE.Vector3(0.01, -0.055, 0.27);

  const lShoulder = new THREE.Vector3(0.375, 0.055, -0.075); // Left shoulder (+X)
  const lElbow = new THREE.Vector3(0.28, -0.075, 0.2);
  const lWrist = new THREE.Vector3(0.035, -0.03, 0.51);

  addArmSegment(rShoulder, rElbow, 0.052, matShirt);
  addArmSegment(rElbow, rWrist, 0.044, forearmMat);
  const rElbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), isAlly ? matShirt : matSkin);
  rElbowCap.position.copy(rElbow);
  weaponPivot.add(rElbowCap);
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), matGlove);
  rHand.position.copy(rWrist);
  weaponPivot.add(rHand);

  addArmSegment(lShoulder, lElbow, 0.052, matShirt);
  addArmSegment(lElbow, lWrist, 0.043, forearmMat);
  const lElbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), isAlly ? matShirt : matSkin);
  lElbowCap.position.copy(lElbow);
  weaponPivot.add(lElbowCap);
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), matGlove);
  lHand.position.copy(lWrist);
  weaponPivot.add(lHand);

  // Classic Steel & Warm Wood-Furniture AK Assault Rifle
  const gunStock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.26), matGunWood);
  gunStock.position.set(0.02, -0.022, 0.05);
  gunStock.rotation.x = 0.08;
  gunStock.castShadow = true;
  weaponPivot.add(gunStock);

  const gunReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.092, 0.34), matGunSteel);
  gunReceiver.position.set(0.02, 0.0, 0.32);
  gunReceiver.castShadow = true;
  weaponPivot.add(gunReceiver);

  const gunHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.072, 0.24), matGunWood);
  gunHandguard.position.set(0.02, 0.005, 0.57);
  gunHandguard.castShadow = true;
  weaponPivot.add(gunHandguard);

  const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.054), matGunWood);
  gunGrip.position.set(0.02, -0.08, 0.26);
  gunGrip.rotation.x = -0.25;
  weaponPivot.add(gunGrip);

  const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.21, 0.07), matGunSteel);
  gunMag.position.set(0.02, -0.115, 0.42);
  gunMag.rotation.x = 0.28;
  gunMag.castShadow = true;
  weaponPivot.add(gunMag);

  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.36, 8), matGunSteel);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0.02, 0.018, 0.78);
  weaponPivot.add(gunBarrel);

  const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.044, 0.018), matGunSteel);
  frontPost.position.set(0.02, 0.046, 0.9);
  weaponPivot.add(frontPost);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0.02, 0.018, 0.98);
  weaponPivot.add(muzzlePoint);

  const muzzleFlash = new THREE.Group();
  muzzleFlash.position.copy(muzzlePoint.position);
  const mfOuterMat = new THREE.MeshBasicMaterial({
    color: 0xff7824,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mfCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffe8b0,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mfJet = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.24, 5), mfOuterMat);
  mfJet.rotation.x = Math.PI / 2;
  mfJet.position.z = 0.12;
  muzzleFlash.add(mfJet);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.15, 4), mfOuterMat);
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    fin.rotation.z = a;
    fin.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.02);
    muzzleFlash.add(fin);
  }
  muzzleFlash.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.048, 0), mfCoreMat));
  muzzleFlash.visible = false;
  weaponPivot.add(muzzleFlash);

  return {
    root,
    hips,
    torso,
    headGroup,
    leftLeg: leftLegBuilt.hipPivot,
    rightLeg: rightLegBuilt.hipPivot,
    leftKnee: leftLegBuilt.kneePivot,
    rightKnee: rightLegBuilt.kneePivot,
    leftFoot: leftLegBuilt.footPivot,
    rightFoot: rightLegBuilt.footPivot,
    weaponPivot,
    muzzlePoint,
    muzzleFlash,
    blindHalo,
    hitMeshes,
    flashMaterials,
  };
}
