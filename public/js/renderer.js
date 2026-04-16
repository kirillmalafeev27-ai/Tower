class TowerRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040604);
    this.scene.fog = new THREE.Fog(0x040604, 5, 22);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.cellSize = 2.8;
    this.eyeHeight = 1.72;
    this.ceilingY = 7.5;

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

    this.questGroup = null;
    this.questCanvas = null;
    this.questTexture = null;
    this.questClickZones = [];
    this.questFloorActive = false;
    this.questHoveredIndex = -1;
    this._lastQuestType = null;
    this._lastQuestData = null;
    this.raycaster = new THREE.Raycaster();

    this.isDragging = false;
    this.lastPointerX = 0;
    this.dragSensitivity = 0.004;

    this.shakeStrength = 0;
    this.shakeUntil = 0;
    this.animationId = null;
    this.clock = new THREE.Clock();

    this._createMaterials();
    this._setupLights();
    this._setupPointerControls();
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  ensureModelsLoaded() {
    return Promise.resolve();
  }

  _createMaterials() {
    this.floorMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1610, roughness: 0.78, metalness: 0.12 });
    this.floorEdgeMaterial = new THREE.MeshStandardMaterial({ color: 0x0e0c09, roughness: 0.85, metalness: 0.08 });
    this.hatchRingMaterial = new THREE.MeshStandardMaterial({ color: 0x3d3025, roughness: 0.55, metalness: 0.5 });
    this.hatchVoidMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.88, metalness: 0.06 });
    this.wallMaterial = new THREE.MeshStandardMaterial({ color: 0x12100d, roughness: 0.92, metalness: 0.05 });
    this.ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x0d0b08, roughness: 0.95, metalness: 0.03 });
    this.monsterMaterial = new THREE.MeshStandardMaterial({ color: 0x4a1812, emissive: 0x1a0404, roughness: 0.62, metalness: 0.12 });
    this.monsterEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff6030 });

    this.boxMaterials = {
      normal: new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.88, metalness: 0.04 }),
      light: new THREE.MeshStandardMaterial({ color: 0x6e5035, roughness: 0.9, metalness: 0.03 }),
      anchor: new THREE.MeshStandardMaterial({ color: 0x44454a, roughness: 0.55, metalness: 0.5 }),
      heavy: new THREE.MeshStandardMaterial({ color: 0x4d3726, roughness: 0.85, metalness: 0.06 }),
      rotten: new THREE.MeshStandardMaterial({ color: 0x2e2416, roughness: 0.98, metalness: 0.01 }),
      safe: new THREE.MeshStandardMaterial({ color: 0x5e4430, roughness: 0.6, metalness: 0.32 })
    };
  }

  _setupLights() {
    this.ambient = new THREE.HemisphereLight(0x1a2210, 0x020303, 0.3);
    this.scene.add(this.ambient);

    this.topLight = new THREE.DirectionalLight(0xc49a6c, 0.2);
    this.topLight.position.set(2, 14, 1);
    this.topLight.castShadow = true;
    this.topLight.shadow.mapSize.width = 2048;
    this.topLight.shadow.mapSize.height = 2048;
    this.topLight.shadow.camera.left = -20;
    this.topLight.shadow.camera.right = 20;
    this.topLight.shadow.camera.top = 20;
    this.topLight.shadow.camera.bottom = -20;
    this.topLight.shadow.bias = -0.002;
    this.scene.add(this.topLight);

    this.torchLight = new THREE.PointLight(0xd4722a, 2.4, 16, 2);
    this.torchLight.castShadow = true;
    this.torchLight.shadow.mapSize.width = 512;
    this.torchLight.shadow.mapSize.height = 512;
    this.torchLight.position.set(0, 3.2, 0);
    this.scene.add(this.torchLight);

    this.dampLight = new THREE.PointLight(0x2a4a20, 0.35, 28, 2);
    this.dampLight.position.set(0, 0.3, 0);
    this.scene.add(this.dampLight);

    this.quakeLight = new THREE.PointLight(0xb84334, 0, 22, 2);
    this.quakeLight.position.set(0, 2.4, 0);
    this.scene.add(this.quakeLight);
  }

  _setupPointerControls() {
    const onPointerDown = (event) => {
      this.isDragging = true;
      this.lastPointerX = event.touches ? event.touches[0].clientX : event.clientX;
    };

    const onPointerMove = (event) => {
      if (!this.isDragging) return;
      const clientX = event.touches ? event.touches[0].clientX : event.clientX;
      const deltaX = clientX - this.lastPointerX;
      this.lastPointerX = clientX;
      this.targetYaw -= deltaX * this.dragSensitivity;
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    this.canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    this.canvas.addEventListener('touchstart', (event) => {
      event.preventDefault();
      onPointerDown(event);
    }, { passive: false });
    window.addEventListener('touchmove', (event) => {
      if (this.isDragging) event.preventDefault();
      onPointerMove(event);
    }, { passive: false });
    window.addEventListener('touchend', onPointerUp);

    this.canvas.addEventListener('mousemove', (event) => {
      if (!this.isDragging) {
        this.updateQuestHover(event);
        this.canvas.style.cursor = this.questHoveredIndex >= 0 ? 'pointer' : '';
      }
    });
  }

  getCameraFacing() {
    let yaw = this.targetYaw % (Math.PI * 2);
    if (yaw < 0) yaw += Math.PI * 2;
    // 0 → facing=0, -π/2 (or 3π/2) → facing=1, π → facing=2, π/2 → facing=3
    // Snap to nearest cardinal: divide circle into 4 sectors
    const sector = Math.round(yaw / (Math.PI / 2)) % 4;
    return [0, 3, 2, 1][sector];
  }

  rotateCamera(deltaRadians) {
    this.targetYaw += deltaRadians;
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
      const isWet = Math.random() < 0.25;
      const mat = this.floorMaterial.clone();
      if (isWet) {
        mat.metalness = 0.22;
        mat.roughness = 0.55;
        mat.color.setHex(0x151210);
      }
      const v = 0.85 + Math.random() * 0.3;
      mat.color.r *= v;
      mat.color.g *= v;
      mat.color.b *= v;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(this.cellSize, 0.35, this.cellSize), mat);
      slab.position.set(world.x, -0.18, world.z);
      slab.receiveShadow = true;
      slab.castShadow = true;
      this.root.add(slab);
      this.floorNodes[tileKey(tile.x, tile.y)] = slab;
    });
  }

  _buildWalls() {
    const config = this.floorData.config;
    const width = config.width * this.cellSize;
    const depth = config.height * this.cellSize;
    const center = this.cellToWorld((config.width - 1) / 2, (config.height - 1) / 2);
    const thick = 0.6;

    [
      { x: center.x, z: center.z - depth / 2 - thick / 2, w: width + thick * 2, d: thick, r: 0 },
      { x: center.x, z: center.z + depth / 2 + thick / 2, w: width + thick * 2, d: thick, r: 0 },
      { x: center.x - width / 2 - thick / 2, z: center.z, w: depth + thick * 2, d: thick, r: Math.PI / 2 },
      { x: center.x + width / 2 + thick / 2, z: center.z, w: depth + thick * 2, d: thick, r: Math.PI / 2 }
    ].forEach((wall) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, this.ceilingY + 0.5, wall.d), this.wallMaterial.clone());
      mesh.position.set(wall.x, this.ceilingY / 2 - 0.1, wall.z);
      mesh.rotation.y = wall.r;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    });

    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(width + thick * 2, 0.4, depth + thick * 2),
      this.ceilingMaterial.clone()
    );
    ceiling.position.set(center.x, this.ceilingY + 0.2, center.z);
    ceiling.receiveShadow = true;
    this.root.add(ceiling);
  }

  _buildHatches() {
    this.floorData.hatches.forEach((hatch) => {
      const world = this.cellToWorld(hatch.x, hatch.y);
      const group = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.85, 0.1, 32), this.hatchRingMaterial.clone());
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.14, 28), this.hatchRingMaterial.clone());
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 28), this.hatchVoidMaterial.clone());
      ring.position.y = 0.02;
      lid.position.set(0, 0.08, 0);
      hole.position.set(0, -0.06, 0);
      ring.receiveShadow = true;
      lid.castShadow = true;
      lid.receiveShadow = true;
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
      const dims = box.type === 'heavy' ? [2.2, 1.6, 1.8] : box.type === 'light' ? [1.5, 1.1, 1.5] : [1.9, 1.4, 1.9];
      const body = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], dims[2]), this.boxMaterials[box.type].clone());
      body.position.y = 0;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      if (box.type === 'anchor') {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 12), this.boxMaterials.anchor.clone());
        chain.position.y = 1.3;
        chain.castShadow = true;
        group.add(chain);
      }

      if (box.type === 'safe') {
        const band = new THREE.Mesh(new THREE.BoxGeometry(dims[0] + 0.08, 0.2, dims[2] + 0.08), this.hatchRingMaterial.clone());
        band.position.y = 0.08;
        band.castShadow = true;
        group.add(band);
      }

      group.position.set(world.x, this.ceilingY - 1.0, world.z);
      this.root.add(group);
      this.boxNodes[box.key] = { group, body };
    });
  }

  _buildDebris() {
    this.floorData.activeTiles.forEach((tile) => {
      const world = this.cellToWorld(tile.x, tile.y);
      const debris = new THREE.Mesh(new THREE.BoxGeometry(this.cellSize * 0.85, 0.75, this.cellSize * 0.85), this.debrisMaterial.clone());
      debris.position.set(world.x, 0.38, world.z);
      debris.rotation.y = Math.random() * 0.4 - 0.2;
      debris.visible = false;
      debris.castShadow = true;
      debris.receiveShadow = true;
      this.root.add(debris);
      this.debrisNodes[tileKey(tile.x, tile.y)] = debris;
    });
  }

  _buildMonster() {
    this.monsterGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 20), this.monsterMaterial.clone());
    body.scale.set(1, 0.85, 1.1);
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 20), this.monsterMaterial.clone());
    head.scale.set(1, 0.9, 1.15);
    head.castShadow = true;
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), this.monsterMaterial.clone());
    jaw.scale.set(1.1, 0.5, 1.3);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), this.monsterEyeMaterial.clone());
    const eyeR = eyeL.clone();
    head.position.set(0, 0.28, 0.52);
    jaw.position.set(0, 0.08, 0.68);
    eyeL.position.set(-0.17, 0.38, 0.8);
    eyeR.position.set(0.17, 0.38, 0.8);
    this.monsterGroup.add(body, head, jaw, eyeL, eyeR);
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
    if (this.questFloorActive) {
      this.targetPitch = -1.05;
    } else {
      this.targetPitch = player.lookMode === 'up' ? 0.96 : -0.28;
    }
    if (instant) {
      this.targetYaw = [0, -Math.PI / 2, Math.PI, Math.PI / 2][player.facing] || 0;
      this.playerRender.copy(this.playerTarget);
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
    }
  }

  sync(snapshot) {
    this.snapshot = snapshot;
  }

  getMoveDelta(relativeDirection, facing = this.getCameraFacing()) {
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

    const smooth = 1 - Math.exp(-deltaSeconds * 5);
    this.playerRender.lerp(this.playerTarget, smooth);
    this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-deltaSeconds * 6));
    this.pitch += (this.targetPitch - this.pitch) * (1 - Math.exp(-deltaSeconds * 6));

    const now = performance.now();
    const shake = now < this.shakeUntil ? this.shakeStrength : 0;
    const bob = Math.sin(this.clock.elapsedTime * 3.5) * 0.005;

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
    const targetY = monster.state === 'ceiling' ? this.ceilingY - 1.0 : monster.state === 'stunned' ? 0.6 : 1.2;
    this.monsterGroup.position.lerp(new THREE.Vector3(monsterWorld.x, targetY, monsterWorld.z), 0.14);
    this.monsterGroup.rotation.x = monster.state === 'ceiling' ? Math.PI : 0;
    this.monsterGroup.scale.setScalar(monster.state === 'stunned' ? 1.12 : 1);

    const pulse = 0.25 + Math.sin(this.clock.elapsedTime * 5) * 0.12;
    this.monsterGroup.children.forEach((child, index) => {
      if (child.material && child.material.emissiveIntensity !== undefined) {
        child.material.emissiveIntensity = 0.15 + pulse + index * 0.03;
      }
    });

    this.quakeLight.intensity = quake.phase === 'warning' ? 1.2 : quake.phase === 'active' ? 2.0 : 0;
    const t = this.clock.elapsedTime;
    const flicker = Math.sin(t * 4.2) * 0.18 + Math.sin(t * 7.1) * 0.1 + Math.sin(t * 11.3) * 0.05;
    this.torchLight.intensity = 2.2 + flicker;
    this.torchLight.position.set(
      this.playerRender.x + Math.sin(t * 1.7) * 0.15,
      2.8,
      this.playerRender.z + Math.cos(t * 1.3) * 0.15
    );
    this.dampLight.position.set(this.playerRender.x, 0.3, this.playerRender.z);

    this.setPlayerState(player);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  showQuestOnFloor(type, data, playerX, playerY) {
    this._ensureQuestPlane();
    const world = this.cellToWorld(playerX, playerY);
    this.questGroup.position.set(world.x, 0.02, world.z);
    this.questGroup.visible = true;
    this.questFloorActive = true;
    this.questHoveredIndex = -1;
    this._lastQuestType = type;
    this._lastQuestData = data;
    this._renderQuestCanvas(type, data, -1);
    this.questTexture.needsUpdate = true;
  }

  hideQuestFromFloor() {
    if (this.questGroup) {
      this.questGroup.visible = false;
    }
    this.questFloorActive = false;
    this.questClickZones = [];
    this.questHoveredIndex = -1;
    this._lastQuestType = null;
    this._lastQuestData = null;
  }

  showAnswerFeedback(selectedIndex, correctIndex) {
    if (!this._lastQuestData || this._lastQuestType !== 'question') {
      return;
    }
    this._lastQuestData._selectedIndex = selectedIndex;
    this._lastQuestData._correctIndex = correctIndex;
    this._lastQuestType = 'feedback';
    this._renderQuestCanvas('feedback', this._lastQuestData, -1);
    this.questTexture.needsUpdate = true;
    this.questClickZones = [];
  }

  getQuestClickIndex(event) {
    if (!this.questGroup || !this.questGroup.visible || !this.questClickZones.length) {
      return -1;
    }

    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.camera);
    const plane = this.questGroup.children[0];
    const hits = this.raycaster.intersectObject(plane);

    if (!hits.length) {
      return -1;
    }

    const uv = hits[0].uv;
    const canvasX = uv.x;
    const canvasY = 1 - uv.y;

    for (const zone of this.questClickZones) {
      if (canvasX >= zone.xStart && canvasX <= zone.xEnd &&
          canvasY >= zone.yStart && canvasY <= zone.yEnd && zone.enabled) {
        return zone.index;
      }
    }

    return -1;
  }

  updateQuestHover(event) {
    if (!this.questGroup || !this.questGroup.visible || !this.questClickZones.length) {
      if (this.questHoveredIndex !== -1) {
        this.questHoveredIndex = -1;
      }
      return;
    }

    const index = this.getQuestClickIndex(event);
    if (index !== this.questHoveredIndex) {
      this.questHoveredIndex = index;
      if (this._lastQuestType && this._lastQuestData) {
        this._renderQuestCanvas(this._lastQuestType, this._lastQuestData, index);
        this.questTexture.needsUpdate = true;
      }
    }
  }

  _ensureQuestPlane() {
    if (!this.questCanvas) {
      this.questCanvas = document.createElement('canvas');
      this.questCanvas.width = 512;
      this.questCanvas.height = 512;
      this.questTexture = new THREE.CanvasTexture(this.questCanvas);
      this.questTexture.minFilter = THREE.LinearFilter;
      this.questTexture.magFilter = THREE.LinearFilter;
    }

    if (!this.questGroup) {
      const geo = new THREE.PlaneGeometry(this.cellSize * 0.92, this.cellSize * 0.92);
      const mat = new THREE.MeshBasicMaterial({ map: this.questTexture, transparent: true, depthWrite: false });
      const plane = new THREE.Mesh(geo, mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = 0;
      this.questGroup = new THREE.Group();
      this.questGroup.add(plane);
      this.questGroup.visible = false;
      this.root.add(this.questGroup);
    }
  }

  _renderQuestCanvas(type, data, hoveredIndex) {
    const ctx = this.questCanvas.getContext('2d');
    const w = this.questCanvas.width;
    const h = this.questCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(30, 22, 16, 0.92)';
    this._roundRect(ctx, 4, 4, w - 8, h - 8, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 128, 96, 0.5)';
    ctx.lineWidth = 2;
    this._roundRect(ctx, 4, 4, w - 8, h - 8, 16);
    ctx.stroke();

    this.questClickZones = [];

    if (type === 'topics') {
      this._drawTopics(ctx, data, w, h, hoveredIndex);
    } else if (type === 'question') {
      this._drawQuestionOnCanvas(ctx, data, w, h, hoveredIndex);
    } else if (type === 'feedback') {
      this._drawFeedbackOnCanvas(ctx, data, w, h);
    }
  }

  _drawTopics(ctx, topics, w, h, hoveredIndex) {
    const pad = 12;
    ctx.fillStyle = '#c8b090';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Выберите тему', w / 2, 32);

    const rowH = Math.min(80, (h - 64) / topics.length);
    const startY = 56;

    topics.forEach((topic, i) => {
      const y = startY + i * rowH;
      const isHovered = hoveredIndex === i && !topic.onCooldown;

      ctx.fillStyle = topic.onCooldown ? 'rgba(50, 38, 28, 0.6)' : isHovered ? 'rgba(90, 68, 45, 0.9)' : 'rgba(60, 45, 30, 0.8)';
      this._roundRect(ctx, pad, y, w - pad * 2, rowH - 6, 8);
      ctx.fill();

      ctx.strokeStyle = topic.onCooldown ? '#443322' : isHovered ? '#d0a870' : '#8a6a48';
      ctx.lineWidth = isHovered ? 2 : 1;
      this._roundRect(ctx, pad, y, w - pad * 2, rowH - 6, 8);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = topic.onCooldown ? '#665544' : '#e8d5b0';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`${i + 1}. ${topic.name}`, pad + 12, y + (rowH - 6) * 0.38);

      ctx.font = '15px sans-serif';
      ctx.fillStyle = topic.onCooldown ? '#554433' : '#b09878';
      ctx.fillText(topic.bonus, pad + 12, y + (rowH - 6) * 0.68);

      if (topic.onCooldown) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#776655';
        ctx.font = '14px sans-serif';
        ctx.fillText(topic.cooldownLabel, w - pad - 12, y + (rowH - 6) / 2);
      }

      if (!topic.onCooldown) {
        this.questClickZones.push({
          yStart: y / h,
          yEnd: (y + rowH - 6) / h,
          xStart: pad / w,
          xEnd: (w - pad) / w,
          index: i,
          enabled: true
        });
      }
    });
  }

  _drawQuestionOnCanvas(ctx, data, w, h, hoveredIndex) {
    const pad = 12;

    ctx.fillStyle = '#b09878';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${data.grammarTopic} \u2022 ${data.level}`, w / 2, 14);

    ctx.fillStyle = '#d8c5a0';
    ctx.font = '17px sans-serif';
    ctx.textAlign = 'center';
    const textBottom = this._questWrapText(ctx, data.text, w / 2, 42, w - 40, 20);

    ctx.fillStyle = '#f0e0c0';
    ctx.font = 'bold 20px sans-serif';
    this._questWrapText(ctx, data.display, w / 2, textBottom + 12, w - 40, 24);

    const optionH = 52;
    const optionsStart = h - data.options.length * optionH - pad;

    data.options.forEach((option, i) => {
      const y = optionsStart + i * optionH;
      const isHovered = hoveredIndex === i;

      ctx.fillStyle = isHovered ? 'rgba(90, 68, 45, 0.9)' : 'rgba(55, 42, 30, 0.8)';
      this._roundRect(ctx, pad, y, w - pad * 2, optionH - 6, 8);
      ctx.fill();

      ctx.strokeStyle = isHovered ? '#d0a870' : '#7a5a38';
      ctx.lineWidth = isHovered ? 2 : 1;
      this._roundRect(ctx, pad, y, w - pad * 2, optionH - 6, 8);
      ctx.stroke();

      ctx.fillStyle = '#e8d5b0';
      ctx.font = '19px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}. ${option}`, pad + 14, y + (optionH - 6) / 2);

      this.questClickZones.push({
        yStart: y / h,
        yEnd: (y + optionH - 6) / h,
        xStart: pad / w,
        xEnd: (w - pad) / w,
        index: i,
        enabled: true
      });
    });
  }

  _drawFeedbackOnCanvas(ctx, data, w, h) {
    const pad = 12;
    const selectedIndex = data._selectedIndex;
    const correctIndex = data._correctIndex;

    ctx.fillStyle = '#b09878';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${data.grammarTopic} \u2022 ${data.level}`, w / 2, 14);

    ctx.fillStyle = '#d8c5a0';
    ctx.font = '17px sans-serif';
    const textBottom = this._questWrapText(ctx, data.text, w / 2, 42, w - 40, 20);

    ctx.fillStyle = '#f0e0c0';
    ctx.font = 'bold 20px sans-serif';
    this._questWrapText(ctx, data.display, w / 2, textBottom + 12, w - 40, 24);

    const optionH = 52;
    const optionsStart = h - data.options.length * optionH - pad;

    data.options.forEach((option, i) => {
      const y = optionsStart + i * optionH;

      let bgColor = 'rgba(55, 42, 30, 0.8)';
      let borderColor = '#7a5a38';
      let textColor = '#e8d5b0';

      if (i === correctIndex) {
        bgColor = 'rgba(40, 100, 50, 0.85)';
        borderColor = '#4ea55b';
        textColor = '#c0ffcc';
      } else if (i === selectedIndex) {
        bgColor = 'rgba(120, 40, 35, 0.85)';
        borderColor = '#b84334';
        textColor = '#ffbbaa';
      }

      ctx.fillStyle = bgColor;
      this._roundRect(ctx, pad, y, w - pad * 2, optionH - 6, 8);
      ctx.fill();

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      this._roundRect(ctx, pad, y, w - pad * 2, optionH - 6, 8);
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.font = '19px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}. ${option}`, pad + 14, y + (optionH - 6) / 2);
    });
  }

  _questWrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line.trim(), x, currentY);
        line = word + ' ';
        currentY += lineHeight;
      } else {
        line = test;
      }
    }

    if (line.trim()) {
      ctx.fillText(line.trim(), x, currentY);
      currentY += lineHeight;
    }

    return currentY;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  dispose() {
    this.stopLoop();
    window.removeEventListener('resize', this._onResize);
    this._clearFloor();
    this.renderer.dispose();
  }
}
