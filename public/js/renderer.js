class TowerRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090b10);
    this.scene.fog = new THREE.Fog(0x090b10, 12, 42);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 120);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.cellSize = 2.15;
    this.eyeHeight = 1.62;
    this.ceilingY = 5.2;

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.floorData = null;
    this.snapshot = null;
    this.boxNodes = Object.create(null);
    this.hatchNodes = Object.create(null);
    this.debrisNodes = Object.create(null);
    this.floorNodes = Object.create(null);
    this.monsterGroup = null;

    this.playerState = { x: 0, y: 0, facing: 0, lookMode: 'down' };
    this.playerTarget = new THREE.Vector3();
    this.playerRender = new THREE.Vector3();
    this.yaw = 0;
    this.targetYaw = 0;
    this.pitch = -0.2;
    this.targetPitch = -0.2;

    this.shakeStrength = 0;
    this.shakeUntil = 0;
    this.animationId = null;
    this.clock = new THREE.Clock();

    this._createMaterials();
    this._setupLights();
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  ensureModelsLoaded() {
    return Promise.resolve();
  }

  _createMaterials() {
    this.floorMaterial = new THREE.MeshStandardMaterial({ color: 0x372a21, roughness: 0.95, metalness: 0.04 });
    this.floorEdgeMaterial = new THREE.MeshStandardMaterial({ color: 0x1d1613, roughness: 0.96, metalness: 0.02 });
    this.hatchRingMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4a35, roughness: 0.75, metalness: 0.35 });
    this.hatchVoidMaterial = new THREE.MeshBasicMaterial({ color: 0x010203 });
    this.debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x6a4c33, roughness: 0.92, metalness: 0.08 });
    this.wallMaterial = new THREE.MeshStandardMaterial({ color: 0x211a16, roughness: 0.94, metalness: 0.03 });
    this.monsterMaterial = new THREE.MeshStandardMaterial({ color: 0x6c2b24, emissive: 0x240606, roughness: 0.78, metalness: 0.05 });
    this.monsterEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff886d });

    this.boxMaterials = {
      normal: new THREE.MeshStandardMaterial({ color: 0x8b623d, roughness: 0.82, metalness: 0.06 }),
      light: new THREE.MeshStandardMaterial({ color: 0xaa8456, roughness: 0.84, metalness: 0.04 }),
      anchor: new THREE.MeshStandardMaterial({ color: 0x6d6d73, roughness: 0.68, metalness: 0.38 }),
      heavy: new THREE.MeshStandardMaterial({ color: 0x7d5b40, roughness: 0.8, metalness: 0.08 }),
      rotten: new THREE.MeshStandardMaterial({ color: 0x5d4a31, roughness: 0.96, metalness: 0.02 }),
      safe: new THREE.MeshStandardMaterial({ color: 0x96724b, roughness: 0.72, metalness: 0.22 })
    };
  }

  _setupLights() {
    this.ambient = new THREE.HemisphereLight(0x8e7d64, 0x050608, 0.52);
    this.scene.add(this.ambient);

    this.topLight = new THREE.DirectionalLight(0xf3d0a4, 0.72);
    this.topLight.position.set(3, 10, 2);
    this.topLight.castShadow = true;
    this.topLight.shadow.mapSize.width = 1024;
    this.topLight.shadow.mapSize.height = 1024;
    this.topLight.shadow.camera.left = -14;
    this.topLight.shadow.camera.right = 14;
    this.topLight.shadow.camera.top = 14;
    this.topLight.shadow.camera.bottom = -14;
    this.scene.add(this.topLight);

    this.torchLight = new THREE.PointLight(0xd7832f, 1.5, 26, 2);
    this.torchLight.position.set(0, 3.6, 0);
    this.scene.add(this.torchLight);

    this.quakeLight = new THREE.PointLight(0xb84334, 0, 20, 2);
    this.quakeLight.position.set(0, 2.4, 0);
    this.scene.add(this.quakeLight);
  }

  buildFloor(floorData) {
    this._clearFloor();
    this.floorData = floorData;
    this.boxNodes = Object.create(null);
    this.hatchNodes = Object.create(null);
    this.debrisNodes = Object.create(null);
    this.floorNodes = Object.create(null);

    this._buildTiles();
    this._buildWalls();
    this._buildHatches();
    this._buildBoxes();
    this._buildDebris();
    this._buildMonster();
  }

  _clearFloor() {
    while (this.root.children.length) {
      const child = this.root.children.pop();
      this.root.remove(child);
    }
    this.floorData = null;
  }

  _buildTiles() {
    this.floorData.activeTiles.forEach((tile) => {
      const world = this.cellToWorld(tile.x, tile.y);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(this.cellSize, 0.35, this.cellSize), this.floorMaterial.clone());
      slab.position.set(world.x, -0.18, world.z);
      slab.receiveShadow = true;
      this.root.add(slab);
      this.floorNodes[tileKey(tile.x, tile.y)] = slab;
    });
  }

  _buildWalls() {
    const config = this.floorData.config;
    const width = config.width * this.cellSize;
    const depth = config.height * this.cellSize;
    const center = this.cellToWorld((config.width - 1) / 2, (config.height - 1) / 2);

    [
      { x: center.x, z: center.z - depth / 2, w: width + 0.4, d: 0.35, r: 0 },
      { x: center.x, z: center.z + depth / 2, w: width + 0.4, d: 0.35, r: 0 },
      { x: center.x - width / 2, z: center.z, w: depth + 0.4, d: 0.35, r: Math.PI / 2 },
      { x: center.x + width / 2, z: center.z, w: depth + 0.4, d: 0.35, r: Math.PI / 2 }
    ].forEach((wall) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, this.ceilingY, wall.d), this.wallMaterial.clone());
      mesh.position.set(wall.x, this.ceilingY / 2 - 0.1, wall.z);
      mesh.rotation.y = wall.r;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    });
  }

  _buildHatches() {
    this.floorData.hatches.forEach((hatch) => {
      const world = this.cellToWorld(hatch.x, hatch.y);
      const group = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 28), this.hatchRingMaterial.clone());
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24), this.hatchRingMaterial.clone());
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.14, 24), this.hatchVoidMaterial.clone());
      ring.position.y = 0.02;
      lid.position.set(0, 0.06, 0);
      hole.position.set(0, -0.04, 0);
      ring.receiveShadow = true;
      lid.castShadow = true;
      group.position.set(world.x, 0, world.z);
      group.add(ring, hole, lid);
      this.root.add(group);
      this.hatchNodes[tileKey(hatch.x, hatch.y)] = { group, lid, hole };
    });
  }

  _buildBoxes() {
    Object.values(this.floorData.boxes).forEach((box) => {
      const world = this.cellToWorld(box.x, box.y);
      const group = new THREE.Group();
      const dims = box.type === 'heavy' ? [1.4, 0.85, 0.9] : box.type === 'light' ? [0.8, 0.58, 0.8] : [1, 0.72, 1];
      const body = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], dims[2]), this.boxMaterials[box.type].clone());
      body.position.y = 0;
      body.castShadow = true;
      group.add(body);

      if (box.type === 'anchor') {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.2, 10), this.boxMaterials.anchor.clone());
        chain.position.y = 0.65;
        group.add(chain);
      }

      if (box.type === 'safe') {
        const band = new THREE.Mesh(new THREE.BoxGeometry(dims[0] + 0.06, 0.12, dims[2] + 0.06), this.hatchRingMaterial.clone());
        band.position.y = 0.05;
        group.add(band);
      }

      group.position.set(world.x, this.ceilingY - 0.58, world.z);
      this.root.add(group);
      this.boxNodes[box.key] = { group, body };
    });
  }

  _buildDebris() {
    this.floorData.activeTiles.forEach((tile) => {
      const world = this.cellToWorld(tile.x, tile.y);
      const debris = new THREE.Mesh(new THREE.BoxGeometry(this.cellSize * 0.9, 0.42, this.cellSize * 0.9), this.debrisMaterial.clone());
      debris.position.set(world.x, 0.21, world.z);
      debris.visible = false;
      debris.castShadow = true;
      debris.receiveShadow = true;
      this.root.add(debris);
      this.debrisNodes[tileKey(tile.x, tile.y)] = debris;
    });
  }

  _buildMonster() {
    this.monsterGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 16), this.monsterMaterial.clone());
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 16), this.monsterMaterial.clone());
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), this.monsterEyeMaterial.clone());
    const eyeR = eyeL.clone();
    head.position.set(0, 0.12, 0.22);
    eyeL.position.set(-0.08, 0.15, 0.37);
    eyeR.position.set(0.08, 0.15, 0.37);
    this.monsterGroup.add(body, head, eyeL, eyeR);
    this.root.add(this.monsterGroup);
  }

  cellToWorld(x, y) {
    const halfW = this.floorData.config.width * this.cellSize * 0.5;
    const halfH = this.floorData.config.height * this.cellSize * 0.5;
    return new THREE.Vector3(
      -halfW + this.cellSize * 0.5 + x * this.cellSize,
      0,
      -halfH + this.cellSize * 0.5 + y * this.cellSize
    );
  }

  setPlayerState(player, instant = false) {
    this.playerState = { ...player };
    const world = this.cellToWorld(player.x, player.y);
    this.playerTarget.set(world.x, this.eyeHeight, world.z);
    this.targetYaw = [0, -Math.PI / 2, Math.PI, Math.PI / 2][player.facing] || 0;
    this.targetPitch = player.lookMode === 'up' ? 0.96 : -0.28;
    if (instant) {
      this.playerRender.copy(this.playerTarget);
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
    }
  }

  sync(snapshot) {
    this.snapshot = snapshot;
  }

  getMoveDelta(relativeDirection, facing = this.playerState.facing) {
    const vectors = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 }
    ];
    const offsetMap = { up: 0, right: 1, down: 2, left: 3 };
    return vectors[(facing + offsetMap[relativeDirection]) % 4];
  }

  shake(intensity, durationMs) {
    this.shakeStrength = intensity;
    this.shakeUntil = performance.now() + durationMs;
  }

  startLoop(updateCallback) {
    this.stopLoop();
    this.clock.start();

    const tick = () => {
      this.animationId = requestAnimationFrame(tick);
      const delta = this.clock.getDelta();
      updateCallback(delta);
      this._animate(delta);
      this.renderer.render(this.scene, this.camera);
    };

    tick();
  }

  stopLoop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  _animate(deltaSeconds) {
    if (!this.snapshot || !this.floorData) {
      return;
    }

    this._applySnapshot();

    const smooth = 1 - Math.exp(-deltaSeconds * 9);
    this.playerRender.lerp(this.playerTarget, smooth);
    this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-deltaSeconds * 10));
    this.pitch += (this.targetPitch - this.pitch) * (1 - Math.exp(-deltaSeconds * 10));

    const now = performance.now();
    const shake = now < this.shakeUntil ? this.shakeStrength : 0;
    const bob = Math.sin(this.clock.elapsedTime * 6) * 0.01;

    this.camera.position.set(
      this.playerRender.x + (Math.random() - 0.5) * shake,
      this.playerRender.y + bob + (Math.random() - 0.5) * shake * 0.45,
      this.playerRender.z + (Math.random() - 0.5) * shake
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + (Math.random() - 0.5) * shake * 0.16;
  }

  _applySnapshot() {
    const { floorData, monster, quake, now, player } = this.snapshot;

    Object.values(floorData.boxes).forEach((box) => {
      const node = this.boxNodes[box.key];
      if (!node) {
        return;
      }

      node.group.visible = !box.fallen;
      if (!box.fallen) {
        const ratio = box.stability / box.maxStability;
        const material = node.body.material;
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 0;
        if (box.revealUntil > now) {
          const color = ratio >= 0.55 ? 0x4ea55b : ratio >= 0.28 ? 0xcaa43d : 0xb84334;
          material.emissive.setHex(color);
          material.emissiveIntensity = 0.45;
        }
        if (box.fortifiedUntil > now) {
          material.emissive.setHex(0x4a86c5);
          material.emissiveIntensity = 0.62;
        }
      }
    });

    floorData.hatches.forEach((hatch) => {
      const node = this.hatchNodes[tileKey(hatch.x, hatch.y)];
      if (!node) {
        return;
      }
      node.hole.visible = hatch.opened;
      node.lid.position.x = hatch.opened ? 0.35 : 0;
      node.lid.position.z = hatch.opened ? -0.3 : 0;
      node.lid.rotation.z = hatch.opened ? -0.9 : 0;
    });

    Object.keys(this.debrisNodes).forEach((key) => {
      this.debrisNodes[key].visible = Boolean(floorData.debrisMap[key]);
    });

    const monsterWorld = this.cellToWorld(monster.x, monster.y);
    const targetY = monster.state === 'ceiling' ? this.ceilingY - 0.32 : monster.state === 'stunned' ? 0.38 : 0.58;
    this.monsterGroup.position.lerp(new THREE.Vector3(monsterWorld.x, targetY, monsterWorld.z), 0.18);
    this.monsterGroup.rotation.x = monster.state === 'ceiling' ? Math.PI : 0;
    this.monsterGroup.scale.setScalar(monster.state === 'stunned' ? 1.08 : 1);

    const pulse = 0.22 + Math.sin(this.clock.elapsedTime * 6) * 0.08;
    this.monsterGroup.children.forEach((child, index) => {
      if (child.material && child.material.emissiveIntensity !== undefined) {
        child.material.emissiveIntensity = 0.1 + pulse + index * 0.02;
      }
    });

    this.quakeLight.intensity = quake.phase === 'warning' ? 0.9 : quake.phase === 'active' ? 1.5 : 0;
    this.torchLight.position.set(this.playerRender.x + 0.5, 2.9, this.playerRender.z + 0.3);
    this.torchLight.intensity = 1.3 + Math.sin(this.clock.elapsedTime * 4.2) * 0.08;

    this.setPlayerState(player);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    this.stopLoop();
    window.removeEventListener('resize', this._onResize);
    this._clearFloor();
    this.renderer.dispose();
  }
}
