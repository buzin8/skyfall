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
  weaponPivot: THREE.Group;
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Group;
  blindHalo: THREE.Mesh;
  hitMeshes: THREE.Mesh[];
  flashMaterials: THREE.MeshStandardMaterial[];
}

/**
 * Articulated multi-part daylight soldier rig with realistic human proportions
 * and accurate head hitbox centered at y ≈ 1.67 (hips 0.94 + torso 0.08 + headGroup 0.50 + head 0.15).
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
      emissiveIntensity: 0.16, // Subtle fill so blue uniform & olive/denim insurgent silhouettes read cleanly in dark industrial lighting
      envMapIntensity: 1.15,
    });
    flashMaterials.push(m);
    return m;
  };

  // ===== FACTIONS & PALETTES =====
  // Ally (Blue Tactical Uniform): Cobalt/sky-blue combat shirt & cargo pants, blue helmet, black rig & boots, wood-stock AK
  // Enemy (Rugged Insurgent): Olive/grey helmet with goggles & olive gaiter, brown/charcoal vest, dark short-sleeve shirt + skin forearms, classic blue jeans
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
    : 0x3b5d88; // Classic faded blue denim jeans for insurgents

  const vestColor = isAlly
    ? 0x1a1e24
    : style === 'striker'
    ? 0x3e2d22
    : 0x322924; // Dark brown / charcoal tactical vest

  const helmetColor = isAlly
    ? 0x2266c4
    : style === 'sentinel'
    ? 0x5d625c
    : 0x5a654d; // Olive / grey combat helmet

  const matShirt = mkMat(shirtColor, 0.86, 0.04);
  const matPants = mkMat(pantsColor, 0.88, 0.03);
  const matVest = mkMat(vestColor, 0.78, 0.08);
  const matHelmet = mkMat(helmetColor, 0.62, 0.14);
  const matSkin = mkMat(isAlly ? 0xd9a98b : 0xd09e7c, 0.72, 0.02);
  const matGaiter = mkMat(0x4a593d, 0.88, 0.02); // Olive-green lower face mask / gaiter
  const matBoot = mkMat(0x1e1b1a, 0.72, 0.12);
  const matKneePad = mkMat(0x181b20, 0.58, 0.18);
  const matGlove = mkMat(0x1d2025, 0.78, 0.08);
  const matGoggleFrame = new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.55, metalness: 0.25 });
  const matGoggleLens = new THREE.MeshStandardMaterial({
    color: 0x131b24,
    roughness: 0.14,
    metalness: 0.65,
    envMapIntensity: 1.5,
  });
  const matGunSteel = new THREE.MeshStandardMaterial({
    color: 0x24282e,
    roughness: 0.4,
    metalness: 0.76,
  });
  const matGunWood = new THREE.MeshStandardMaterial({
    color: 0x7a4726,
    roughness: 0.64,
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

  // ===== ARTICULATED REALISTIC LEGS =====
  const buildLeg = (side: number): THREE.Group => {
    const legRoot = new THREE.Group();
    legRoot.position.set(side * 0.125, 0, 0);

    // Rounded athletic thigh
    const thigh = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.082, 0.44, 10), matPants), 'leg');
    thigh.position.y = -0.22;
    legRoot.add(thigh);

    // Side cargo pocket on Blue Ally cargo pants
    if (isAlly) {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.12), matPants);
      pocket.position.set(side * 0.085, -0.22, 0.0);
      pocket.castShadow = true;
      legRoot.add(pocket);

      // Molded dark tactical knee pad
      const knee = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.065), matKneePad);
      knee.position.set(0, -0.43, 0.072);
      knee.castShadow = true;
      legRoot.add(knee);
    } else {
      // Subtle denim knee fold / patch on insurgent jeans
      const kneeFold = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.08, 0.1, 10), matPants);
      kneeFold.position.set(0, -0.43, 0.008);
      legRoot.add(kneeFold);
    }

    // Shin / calf
    const shin = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.066, 0.4, 10), matPants), 'leg');
    shin.position.y = -0.64;
    legRoot.add(shin);

    // Rugged combat boot shaft + sole
    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.072, 0.14, 10), matBoot);
    bootShaft.position.set(0, -0.82, 0);
    bootShaft.castShadow = true;
    legRoot.add(bootShaft);

    const bootFoot = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.1, 0.27), matBoot);
    bootFoot.position.set(0, -0.89, 0.05);
    bootFoot.castShadow = true;
    legRoot.add(bootFoot);

    return legRoot;
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  hips.add(leftLeg);
  hips.add(rightLeg);

  // Pelvis & dark leather/webbing duty belt
  const pelvis = registerHit(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.23), matPants), 'body');
  pelvis.position.y = 0.03;
  hips.add(pelvis);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.25), matBoot);
  belt.position.y = 0.08;
  hips.add(belt);

  // ===== TORSO & TACTICAL CHEST RIG / VEST =====
  const torso = new THREE.Group();
  torso.position.y = 0.08; // World y = 1.02
  hips.add(torso);

  // Inner combat shirt torso
  const shirtChest = registerHit(new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.46, 0.23), matShirt), 'body');
  shirtChest.position.y = 0.24;
  torso.add(shirtChest);

  // Tactical plate carrier / chest rig vest
  const vestBody = registerHit(new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.37, 0.275), matVest), 'body');
  vestBody.position.set(0, 0.26, 0.005);
  torso.add(vestBody);

  // Vest shoulder straps
  for (const sx of [-0.135, 0.135]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.14, 0.25), matVest);
    strap.position.set(sx, 0.44, 0);
    strap.castShadow = true;
    torso.add(strap);
  }

  // Front magazine pouches on tactical vest
  for (const px of [-0.115, 0, 0.115]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.06), matVest);
    pouch.position.set(px, 0.18, 0.155);
    pouch.castShadow = true;
    torso.add(pouch);
  }

  // Compact tactical radio / utility pack on back
  const backPack = registerHit(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.12), matVest), 'body');
  backPack.position.set(0, 0.28, -0.18);
  torso.add(backPack);

  // Shirt collar & rounded shoulder caps
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 10), matShirt);
  collar.position.set(0, 0.48, 0);
  torso.add(collar);

  for (const sx of [-1, 1]) {
    const shoulder = registerHit(new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), matShirt), 'body');
    shoulder.position.set(sx * 0.24, 0.4, 0);
    torso.add(shoulder);
  }

  // ===== HEAD, HELMET, GOGGLES & FACE MASK (center y ≈ 1.67!) =====
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.5, 0); // World y = 1.52
  torso.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.09, 10), isAlly ? matSkin : matGaiter);
  neck.position.y = 0.03;
  headGroup.add(neck);

  // Head hitbox centered at local y = 0.15 -> exact world y = 1.67!
  const headBase = registerHit(new THREE.Mesh(new THREE.SphereGeometry(0.128, 12, 10), matSkin), 'head');
  headBase.scale.set(0.92, 1.08, 0.98);
  headBase.position.y = 0.15;
  headGroup.add(headBase);

  // Rounded ballistic tactical helmet dome (cobalt blue for Ally, olive/grey for Enemy)
  const helmetDome = registerHit(
    new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), matHelmet),
    'head'
  );
  helmetDome.position.set(0, 0.175, -0.008);
  helmetDome.rotation.x = -0.1;
  headGroup.add(helmetDome);

  // Helmet rear neck rim / ear guard
  const helmetRim = new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.154, 0.065, 14, 1, true), matHelmet);
  helmetRim.position.set(0, 0.165, -0.01);
  headGroup.add(helmetRim);

  if (isAlly) {
    // Blue-Team Ally: sleek dark tactical visor/goggles over eyes + matte chin strap
    const gogglesFrame = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.072, 0.07), matGoggleFrame);
    gogglesFrame.position.set(0, 0.172, 0.1);
    headGroup.add(gogglesFrame);

    const visorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.056, 0.035), matGoggleLens);
    visorGlass.position.set(0, 0.172, 0.126);
    headGroup.add(visorGlass);

    const chinStrap = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.01, 6, 12, Math.PI), matGoggleFrame);
    chinStrap.rotation.x = Math.PI * 0.72;
    chinStrap.position.set(0, 0.09, 0.02);
    headGroup.add(chinStrap);
  } else {
    // Front-Charging Insurgent: tactical goggles across brow/eyes + olive-green lower face mask / gaiter!
    const goggleBand = new THREE.Mesh(new THREE.CylinderGeometry(0.146, 0.146, 0.034, 14), matGoggleFrame);
    goggleBand.position.set(0, 0.205, -0.004);
    headGroup.add(goggleBand);

    for (const gx of [-0.048, 0.048]) {
      const gRim = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.058, 0.055), matGoggleFrame);
      gRim.position.set(gx, 0.205, 0.122);
      headGroup.add(gRim);
      const gLens = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.044, 0.024), matGoggleLens);
      gLens.position.set(gx, 0.205, 0.145);
      headGroup.add(gLens);
    }

    // Olive-green lower face mask / neck gaiter covering nose, mouth & chin
    const gaiter = new THREE.Mesh(new THREE.CylinderGeometry(0.116, 0.106, 0.135, 12), matGaiter);
    gaiter.position.set(0, 0.085, 0.016);
    headGroup.add(gaiter);
  }

  // Blind status ring (visible when flashed by Q!)
  const blindHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.022, 8, 18),
    new THREE.MeshBasicMaterial({ color: 0xffe46b, transparent: true, opacity: 0.92 })
  );
  blindHalo.rotation.x = Math.PI / 2;
  blindHalo.position.set(0, 0.36, 0);
  blindHalo.visible = false;
  headGroup.add(blindHalo);

  // ===== ARTICULATED TWO-HANDED ARMS & ASSAULT RIFLE =====
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.16, 0.35, 0.08);
  torso.add(weaponPivot);

  // Upper arms (shirt sleeve) + Forearms (blue sleeves for Ally; visible bare skin forearms for short-sleeve Enemy!)
  const forearmMat = isAlly ? matShirt : matSkin;

  // Right upper arm & forearm gripping rifle grip
  const rUpper = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.052, 0.22, 8), matShirt), 'body');
  rUpper.rotation.x = Math.PI / 2;
  rUpper.position.set(0.08, -0.02, 0.08);
  weaponPivot.add(rUpper);

  const rForearm = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.044, 0.22, 8), forearmMat), 'body');
  rForearm.rotation.x = Math.PI / 2;
  rForearm.position.set(0.06, -0.04, 0.24);
  rForearm.rotation.z = 0.14;
  weaponPivot.add(rForearm);

  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.09), matGlove);
  rHand.position.set(0.01, -0.045, 0.33);
  weaponPivot.add(rHand);

  // Left upper arm & forearm reaching across chest to grip forward handguard!
  const lUpper = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.052, 0.24, 8), matShirt), 'body');
  lUpper.rotation.set(Math.PI / 2, 0, -0.35);
  lUpper.position.set(-0.27, -0.03, 0.11);
  weaponPivot.add(lUpper);

  const lForearm = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.043, 0.28, 8), forearmMat), 'body');
  lForearm.rotation.set(Math.PI / 2, 0, -0.58);
  lForearm.position.set(-0.15, -0.04, 0.34);
  weaponPivot.add(lForearm);

  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.095), matGlove);
  lHand.position.set(-0.025, -0.035, 0.52);
  weaponPivot.add(lHand);

  // ===== ASSAULT RIFLE (Classic Steel + Warm Wood Stock/Forend AK-style Rifle) =====
  const rifleStockMat = matGunWood;
  const rifleHandguardMat = matGunWood;

  // Buttstock braced against right shoulder
  const gunStock = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.105, 0.26), rifleStockMat);
  gunStock.position.set(-0.02, -0.025, 0.05);
  gunStock.rotation.x = 0.08;
  gunStock.castShadow = true;
  weaponPivot.add(gunStock);

  // Matte steel receiver
  const gunReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.095, 0.34), matGunSteel);
  gunReceiver.position.set(-0.02, 0.0, 0.32);
  gunReceiver.castShadow = true;
  weaponPivot.add(gunReceiver);

  // Wooden/polymer handguard forend
  const gunHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.074, 0.24), rifleHandguardMat);
  gunHandguard.position.set(-0.02, 0.005, 0.57);
  gunHandguard.castShadow = true;
  weaponPivot.add(gunHandguard);

  // Pistol grip
  const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.11, 0.055), rifleStockMat);
  gunGrip.position.set(-0.02, -0.08, 0.26);
  gunGrip.rotation.x = -0.25;
  weaponPivot.add(gunGrip);

  // Curved AK-style banana magazine
  const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.21, 0.072), matGunSteel);
  gunMag.position.set(-0.02, -0.115, 0.42);
  gunMag.rotation.x = 0.28;
  gunMag.castShadow = true;
  weaponPivot.add(gunMag);

  // Steel barrel + front sight post
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.36, 8), matGunSteel);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(-0.02, 0.018, 0.78);
  gunBarrel.castShadow = true;
  weaponPivot.add(gunBarrel);

  const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.018), matGunSteel);
  frontPost.position.set(-0.02, 0.048, 0.9);
  weaponPivot.add(frontPost);

  // Muzzle anchor & compact crisp 3rd-person muzzle flash
  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(-0.02, 0.018, 0.98);
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
    leftLeg,
    rightLeg,
    weaponPivot,
    muzzlePoint,
    muzzleFlash,
    blindHalo,
    hitMeshes,
    flashMaterials,
  };
}
