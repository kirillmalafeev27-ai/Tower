class TowerRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050705);
    this.scene.fog = new THREE.Fog(0x070905, 18, 82);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 160);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.cellSize = 3.35;
    this.eyeHeight = 1.78;
    this.ceilingY = 8.4;

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.floorData = null;
    this.snapshot = null;
    this.boxNodes = Object.create(null);
    this.hatchNodes = Object.create(null);
    this.debrisNodes = Object.create(null);
    this.floorNodes = Object.create(null);
    this.monsterGroup = null;
    this.wallTorches = [];
    this.moteField = null;
    this.questionPlane = null;
    this.questionCanvas = document.createElement('canvas');
    this.questionCanvas.width = 1536;
    this.questionCanvas.height = 1536;
    this.questionContext = this.questionCanvas.getContext('2d');
    this.questionTexture = new THREE.CanvasTexture(this.questionCanvas);
    this.questionTexture.encoding = THREE.sRGBEncoding;
    this.questionTexture.minFilter = THREE.LinearFilter;
    this.questionTexture.magFilter = THREE.LinearFilter;
    this.questionOptionRects = [];
    this.questionHoverIndex = -1;
    this.questionSignature = '';
    this.raycaster = new THREE.Raycaster();

    this.playerState = { x: 0, y: 0, facing: 0, lookMode: 'down', cameraYaw: 0, cameraPitch: 0 };
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

  _makeCanvasTexture(size, repeatX, repeatY, painter) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    painter(ctx, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.encoding = THREE.sRGBEncoding;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }

  _hexToRgb(hex) {
    return {
      r: (hex >> 16) & 255,
      g: (hex >> 8) & 255,
      b: hex & 255
    };
  }

  _rgba(hex, alpha = 1) {
    const { r, g, b } = this._hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  _makeStoneTexture({ base, dark, light, moss, seed = 0, repeatX = 1, repeatY = 1 }) {
    return this._makeCanvasTexture(320, repeatX, repeatY, (ctx, size) => {
      ctx.fillStyle = this._rgba(base);
      ctx.fillRect(0, 0, size, size);

      for (let index = 0; index < 1800; index += 1) {
        const x = this._noise(index, seed, 3) * size;
        const y = this._noise(index, seed, 5) * size;
        const w = 4 + this._noise(index, seed, 7) * 24;
        const h = 4 + this._noise(index, seed, 11) * 24;
        const alpha = 0.03 + this._noise(index, seed, 13) * 0.08;
        ctx.fillStyle = this._rgba(this._noise(index, seed, 17) > 0.52 ? dark : light, alpha);
        ctx.fillRect(x, y, w, h);
      }

      for (let seamX = 0; seamX < size; seamX += size / 3) {
        ctx.fillStyle = this._rgba(dark, 0.18);
        ctx.fillRect(seamX + 1, 0, 3, size);
      }
      for (let seamY = 0; seamY < size; seamY += size / 3) {
        ctx.fillStyle = this._rgba(dark, 0.14);
        ctx.fillRect(0, seamY + 1, size, 3);
      }

      ctx.lineCap = 'round';
      for (let crack = 0; crack < 34; crack += 1) {
        const startX = this._noise(crack, seed, 19) * size;
        const startY = this._noise(crack, seed, 23) * size;
        const segments = 3 + Math.floor(this._noise(crack, seed, 29) * 4);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        for (let segment = 0; segment < segments; segment += 1) {
          const nx = startX + (this._noise(crack, segment, 31) - 0.5) * 120;
          const ny = startY + (this._noise(crack, segment, 37) - 0.5) * 120;
          ctx.lineTo(nx, ny);
        }
        ctx.strokeStyle = this._rgba(dark, 0.18);
        ctx.lineWidth = 1 + this._noise(crack, seed, 41) * 2;
        ctx.stroke();
      }

      for (let patch = 0; patch < 18; patch += 1) {
        const x = this._noise(patch, seed, 43) * size;
        const y = this._noise(patch, seed, 47) * size;
        const radius = 18 + this._noise(patch, seed, 53) * 42;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, this._rgba(moss, 0.18));
        gradient.addColorStop(1, this._rgba(moss, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    });
  }

  _makeWoodTexture({ base, dark, light, seed = 0, repeatX = 1, repeatY = 1 }) {
    return this._makeCanvasTexture(320, repeatX, repeatY, (ctx, size) => {
      const gradient = ctx.createLinearGradient(0, 0, size, 0);
      gradient.addColorStop(0, this._rgba(base));
      gradient.addColorStop(0.5, this._rgba(light));
      gradient.addColorStop(1, this._rgba(base));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      for (let band = 0; band < 18; band += 1) {
        const x = band * (size / 18);
        ctx.fillStyle = this._rgba(this._noise(band, seed, 3) > 0.48 ? dark : light, 0.18);
        ctx.fillRect(x, 0, 4 + this._noise(band, seed, 5) * 10, size);
      }

      for (let line = 0; line < 120; line += 1) {
        const y = this._noise(line, seed, 7) * size;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += 18) {
          ctx.lineTo(x, y + (this._noise(line, x, 11) - 0.5) * 8);
        }
        ctx.strokeStyle = this._rgba(dark, 0.14);
        ctx.lineWidth = 1 + this._noise(line, seed, 13) * 1.2;
        ctx.stroke();
      }

      for (let knot = 0; knot < 10; knot += 1) {
        const x = 26 + this._noise(knot, seed, 17) * (size - 52);
        const y = 26 + this._noise(knot, seed, 19) * (size - 52);
        ctx.beginPath();
        ctx.ellipse(x, y, 10 + this._noise(knot, seed, 23) * 12, 6 + this._noise(knot, seed, 29) * 8, this._noise(knot, seed, 31) * Math.PI, 0, Math.PI * 2);
        ctx.fillStyle = this._rgba(dark, 0.24);
        ctx.fill();
      }
    });
  }

  _makeMetalTexture({ base, dark, light, seed = 0, repeatX = 1, repeatY = 1 }) {
    return this._makeCanvasTexture(256, repeatX, repeatY, (ctx, size) => {
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, this._rgba(light));
      gradient.addColorStop(0.5, this._rgba(base));
      gradient.addColorStop(1, this._rgba(dark));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      for (let scratch = 0; scratch < 90; scratch += 1) {
        const x = this._noise(scratch, seed, 3) * size;
        const y = this._noise(scratch, seed, 5) * size;
        const length = 10 + this._noise(scratch, seed, 7) * 46;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + length, y + length * 0.08);
        ctx.strokeStyle = this._rgba(light, 0.16);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }

  _createMaterials() {
    const floorStoneMap = this._makeStoneTexture({ base: 0x2b241a, dark: 0x120f0c, light: 0x4a3f31, moss: 0x2a3620, seed: 1, repeatX: 1.4, repeatY: 1.4 });
    const floorInsetMap = this._makeStoneTexture({ base: 0x1a1d15, dark: 0x0a0d09, light: 0x30352b, moss: 0x1f301d, seed: 2, repeatX: 2.2, repeatY: 2.2 });
    const wallStoneMap = this._makeStoneTexture({ base: 0x171811, dark: 0x090907, light: 0x2f3025, moss: 0x33432b, seed: 3, repeatX: 1.3, repeatY: 0.8 });
    const trimStoneMap = this._makeStoneTexture({ base: 0x282117, dark: 0x110d09, light: 0x43362a, moss: 0x29341f, seed: 4, repeatX: 1.8, repeatY: 1.2 });
    const ceilingStoneMap = this._makeStoneTexture({ base: 0x0d0c09, dark: 0x040403, light: 0x23201a, moss: 0x1d2619, seed: 5, repeatX: 1.1, repeatY: 1.1 });
    const ironMap = this._makeMetalTexture({ base: 0x4e412d, dark: 0x2a241a, light: 0x7a6a52, seed: 6, repeatX: 1.5, repeatY: 1.5 });
    const normalCrateMap = this._makeWoodTexture({ base: 0x5d4732, dark: 0x342518, light: 0x7b6041, seed: 7, repeatX: 1.8, repeatY: 1.4 });
    const lightCrateMap = this._makeWoodTexture({ base: 0x71553a, dark: 0x402d1b, light: 0x94704c, seed: 8, repeatX: 1.8, repeatY: 1.4 });
    const heavyCrateMap = this._makeWoodTexture({ base: 0x4f3c2d, dark: 0x2a1d14, light: 0x6a503b, seed: 9, repeatX: 1.2, repeatY: 1.1 });
    const rottenCrateMap = this._makeWoodTexture({ base: 0x382a1d, dark: 0x17110b, light: 0x534030, seed: 10, repeatX: 1.6, repeatY: 1.3 });
    const safeCrateMap = this._makeWoodTexture({ base: 0x6a593e, dark: 0x392d1d, light: 0x8c7653, seed: 11, repeatX: 1.4, repeatY: 1.2 });

    this.floorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorStoneMap, roughness: 0.92, metalness: 0.03 });
    this.floorInsetMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorInsetMap, roughness: 0.72, metalness: 0.02 });
    this.floorEdgeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallStoneMap, roughness: 0.98, metalness: 0.01 });
    this.puddleMaterial = new THREE.MeshStandardMaterial({ color: 0x222418, roughness: 0.14, metalness: 0.03, transparent: true, opacity: 0.82 });
    this.hatchRingMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ironMap, roughness: 0.82, metalness: 0.24 });
    this.hatchVoidMaterial = new THREE.MeshBasicMaterial({ color: 0x010203 });
    this.debrisMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: heavyCrateMap, roughness: 0.97, metalness: 0.03 });
    this.wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallStoneMap, roughness: 0.97, metalness: 0.02 });
    this.wallTrimMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: trimStoneMap, roughness: 0.9, metalness: 0.03 });
    this.ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ceilingStoneMap, roughness: 0.95, metalness: 0.01 });
    this.columnMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: trimStoneMap, roughness: 0.98, metalness: 0.02 });
    this.mossMaterial = new THREE.MeshStandardMaterial({ color: 0x23311f, roughness: 1, metalness: 0, transparent: true, opacity: 0.68, side: THREE.DoubleSide });
    this.torchBracketMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ironMap, roughness: 0.64, metalness: 0.42 });
    this.torchFlameMaterial = new THREE.MeshBasicMaterial({ color: 0xffa24a });
    this.monsterMaterial = new THREE.MeshStandardMaterial({ color: 0x1a130f, emissive: 0x140904, roughness: 0.94, metalness: 0.01 });
    this.monsterEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff8b3d });

    this.boxMaterials = {
      normal: new THREE.MeshStandardMaterial({ color: 0xffffff, map: normalCrateMap, roughness: 0.95, metalness: 0.03 }),
      light: new THREE.MeshStandardMaterial({ color: 0xffffff, map: lightCrateMap, roughness: 0.92, metalness: 0.02 }),
      anchor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ironMap, roughness: 0.72, metalness: 0.28 }),
      heavy: new THREE.MeshStandardMaterial({ color: 0xffffff, map: heavyCrateMap, roughness: 0.97, metalness: 0.03 }),
      rotten: new THREE.MeshStandardMaterial({ color: 0xffffff, map: rottenCrateMap, roughness: 1, metalness: 0.01 }),
      safe: new THREE.MeshStandardMaterial({ color: 0xffffff, map: safeCrateMap, roughness: 0.84, metalness: 0.12 })
    };
  }

  _setupLights() {
    this.ambient = new THREE.HemisphereLight(0x384732, 0x020302, 0.34);
    this.scene.add(this.ambient);

    this.topLight = new THREE.DirectionalLight(0x77886a, 0.46);
    this.topLight.position.set(-6, this.ceilingY + 5, -4);
    this.topLight.castShadow = true;
    this.topLight.shadow.mapSize.width = 1536;
    this.topLight.shadow.mapSize.height = 1536;
    this.topLight.shadow.camera.near = 0.5;
    this.topLight.shadow.camera.far = this.ceilingY + 18;
    this.scene.add(this.topLight.target);
    this.scene.add(this.topLight);

    this.fillLight = new THREE.PointLight(0x294330, 0.38, 52, 2);
    this.fillLight.position.set(0, 1.2, 0);
    this.scene.add(this.fillLight);

    this.torchLight = new THREE.PointLight(0xe08a32, 1.65, 34, 1.8);
    this.torchLight.position.set(0, 3.2, 0);
    this.scene.add(this.torchLight);

    this.quakeLight = new THREE.PointLight(0xbf4e31, 0, 26, 1.8);
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
    this.wallTorches = [];

    const center = this.cellToWorld((floorData.config.width - 1) / 2, (floorData.config.height - 1) / 2);
    const span = Math.max(floorData.config.width, floorData.config.height) * this.cellSize * 0.76;
    this.topLight.position.set(
      center.x - floorData.config.width * this.cellSize * 0.18,
      this.ceilingY + 5.2,
      center.z - floorData.config.height * this.cellSize * 0.24
    );
    this.topLight.target.position.set(center.x, 0, center.z);
    this.topLight.shadow.camera.left = -span;
    this.topLight.shadow.camera.right = span;
    this.topLight.shadow.camera.top = span;
    this.topLight.shadow.camera.bottom = -span;
    this.topLight.shadow.camera.updateProjectionMatrix();
    this.topLight.target.updateMatrixWorld();

    this._buildTiles();
    this._buildWalls();
    this._buildHatches();
    this._buildBoxes();
    this._buildDebris();
    this._buildMonster();
    this._buildMoteField();
    this._buildQuestionCard();
  }

  _clearFloor() {
    while (this.root.children.length) {
      const child = this.root.children.pop();
      this.root.remove(child);
    }
    this.floorData = null;
    this.wallTorches = [];
    this.moteField = null;
    this.questionPlane = null;
    this.questionOptionRects = [];
    this.questionHoverIndex = -1;
    this.questionSignature = '';
  }

  _buildTiles() {
    this.floorData.activeTiles.forEach((tile) => {
      const world = this.cellToWorld(tile.x, tile.y);
      const slabHeight = 0.78;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(this.cellSize, slabHeight, this.cellSize), this.floorEdgeMaterial.clone());
      slab.position.set(world.x, -slabHeight * 0.52, world.z);
      slab.castShadow = true;
      slab.receiveShadow = true;
      this.root.add(slab);

      const stone = new THREE.Mesh(new THREE.BoxGeometry(this.cellSize * 0.92, 0.16, this.cellSize * 0.92), this.floorMaterial.clone());
      stone.position.set(world.x, 0.02, world.z);
      stone.rotation.y = (this._noise(tile.x, tile.y, 3) - 0.5) * 0.08;
      stone.receiveShadow = true;
      this.root.add(stone);

      const inset = new THREE.Mesh(new THREE.BoxGeometry(this.cellSize * 0.68, 0.08, this.cellSize * 0.68), this.floorInsetMaterial.clone());
      inset.position.set(world.x, 0.12, world.z);
      inset.rotation.y = (this._noise(tile.x, tile.y, 9) - 0.5) * 0.12;
      inset.receiveShadow = true;
      this.root.add(inset);

      if (this._noise(tile.x, tile.y, 17) > 0.58) {
        const puddle = new THREE.Mesh(
          new THREE.CylinderGeometry(this.cellSize * 0.26, this.cellSize * 0.32, 0.04, 18),
          this.puddleMaterial.clone()
        );
        puddle.position.set(
          world.x + (this._noise(tile.x, tile.y, 21) - 0.5) * 0.55,
          0.1,
          world.z + (this._noise(tile.x, tile.y, 27) - 0.5) * 0.55
        );
        puddle.scale.set(1, 1, 0.65 + this._noise(tile.x, tile.y, 29) * 0.45);
        puddle.rotation.y = this._noise(tile.x, tile.y, 31) * Math.PI;
        puddle.receiveShadow = true;
        this.root.add(puddle);
      }

      this.floorNodes[tileKey(tile.x, tile.y)] = stone;
    });
  }

  _buildWalls() {
    const config = this.floorData.config;
    const width = config.width * this.cellSize;
    const depth = config.height * this.cellSize;
    const center = this.cellToWorld((config.width - 1) / 2, (config.height - 1) / 2);
    const wallThickness = 0.86;
    const wallHeight = this.ceilingY + 0.7;

    [
      { x: center.x, z: center.z - depth / 2, w: width + wallThickness * 1.5, d: wallThickness, r: 0 },
      { x: center.x, z: center.z + depth / 2, w: width + wallThickness * 1.5, d: wallThickness, r: 0 },
      { x: center.x - width / 2, z: center.z, w: depth + wallThickness * 1.5, d: wallThickness, r: Math.PI / 2 },
      { x: center.x + width / 2, z: center.z, w: depth + wallThickness * 1.5, d: wallThickness, r: Math.PI / 2 }
    ].forEach((wall) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, wallHeight, wall.d), this.wallMaterial.clone());
      mesh.position.set(wall.x, wallHeight / 2 - 0.18, wall.z);
      mesh.rotation.y = wall.r;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);

      const trim = new THREE.Mesh(new THREE.BoxGeometry(wall.w * 0.96, 0.48, wall.d + 0.16), this.wallTrimMaterial.clone());
      trim.position.set(wall.x, 0.12, wall.z);
      trim.rotation.y = wall.r;
      trim.castShadow = true;
      trim.receiveShadow = true;
      this.root.add(trim);

      const crown = new THREE.Mesh(new THREE.BoxGeometry(wall.w * 0.92, 0.36, wall.d + 0.22), this.wallTrimMaterial.clone());
      crown.position.set(wall.x, wallHeight - 0.32, wall.z);
      crown.rotation.y = wall.r;
      crown.castShadow = true;
      crown.receiveShadow = true;
      this.root.add(crown);
    });

    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(width + wallThickness * 2.6, 0.9, depth + wallThickness * 2.6),
      this.ceilingMaterial.clone()
    );
    ceiling.position.set(center.x, this.ceilingY + 0.45, center.z);
    ceiling.castShadow = true;
    ceiling.receiveShadow = true;
    this.root.add(ceiling);

    for (let index = 0; index < config.width; index += 2) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.62, depth + wallThickness * 1.2),
        this.wallTrimMaterial.clone()
      );
      beam.position.set(
        center.x - width / 2 + this.cellSize * 0.5 + index * this.cellSize,
        this.ceilingY - 0.55,
        center.z
      );
      beam.castShadow = true;
      beam.receiveShadow = true;
      this.root.add(beam);
    }

    this._buildButtresses(center, width, depth, wallThickness);
    this._buildWallTorches(center, width, depth, wallThickness);
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
      const dims = box.type === 'heavy'
        ? [2.45, 1.72, 1.92]
        : box.type === 'light'
          ? [1.72, 1.08, 1.58]
          : box.type === 'anchor'
            ? [2.15, 1.58, 1.84]
            : box.type === 'safe'
              ? [2.12, 1.54, 1.88]
              : [1.96, 1.44, 1.7];
      const body = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], dims[2]), this.boxMaterials[box.type].clone());
      body.position.y = 0;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(dims[0] * 0.96, 0.16, dims[2] * 0.96),
        this.wallTrimMaterial.clone()
      );
      lid.position.y = dims[1] * 0.5 - 0.12;
      lid.castShadow = true;
      lid.receiveShadow = true;
      group.add(lid);

      [-1, 1].forEach((direction) => {
        const strap = new THREE.Mesh(
          new THREE.BoxGeometry(dims[0] + 0.08, 0.14, 0.12),
          this.torchBracketMaterial.clone()
        );
        strap.position.set(0, 0.02, direction * (dims[2] * 0.5 - 0.18));
        strap.castShadow = true;
        group.add(strap);
      });

      [-1, 1].forEach((direction) => {
        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, dims[1] * 0.92, 0.16),
          this.wallTrimMaterial.clone()
        );
        brace.position.set(direction * (dims[0] * 0.5 - 0.16), 0, 0);
        brace.castShadow = true;
        brace.receiveShadow = true;
        group.add(brace);
      });

      [-1, 1].forEach((direction) => {
        const frontBrace = new THREE.Mesh(
          new THREE.BoxGeometry(dims[0] * 0.78, 0.12, 0.12),
          this.wallTrimMaterial.clone()
        );
        frontBrace.position.set(0, 0.08, direction * (dims[2] * 0.5 - 0.12));
        frontBrace.castShadow = true;
        frontBrace.receiveShadow = true;
        group.add(frontBrace);

        const diagA = new THREE.Mesh(
          new THREE.BoxGeometry(dims[0] * 0.78, 0.1, 0.1),
          this.wallTrimMaterial.clone()
        );
        diagA.position.set(0, 0.18, direction * (dims[2] * 0.5 - 0.1));
        diagA.rotation.z = 0.54;
        diagA.castShadow = true;
        group.add(diagA);

        const diagB = diagA.clone();
        diagB.rotation.z = -0.54;
        group.add(diagB);
      });

      if (box.type === 'anchor') {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 2.2, 10), this.boxMaterials.anchor.clone());
        chain.position.y = 1.42;
        chain.castShadow = true;
        group.add(chain);
      }

      if (box.type === 'safe') {
        const band = new THREE.Mesh(new THREE.BoxGeometry(dims[0] + 0.08, 0.16, dims[2] + 0.08), this.hatchRingMaterial.clone());
        band.position.y = 0.05;
        band.castShadow = true;
        group.add(band);
      }

      group.position.set(world.x, this.ceilingY - dims[1] * 0.5 - 0.16, world.z);
      this.root.add(group);
      this.boxNodes[box.key] = { group, body };
    });
  }

  _buildDebris() {
    this.floorData.activeTiles.forEach((tile) => {
      const world = this.cellToWorld(tile.x, tile.y);
      const debris = new THREE.Mesh(new THREE.BoxGeometry(this.cellSize * 0.88, 0.56, this.cellSize * 0.88), this.debrisMaterial.clone());
      debris.position.set(world.x, 0.29, world.z);
      debris.visible = false;
      debris.castShadow = true;
      debris.receiveShadow = true;
      this.root.add(debris);
      this.debrisNodes[tileKey(tile.x, tile.y)] = debris;
    });
  }

  _buildMonster() {
    this.monsterGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.86, 1.84, 16), this.monsterMaterial.clone());
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.88, 18, 16), this.monsterMaterial.clone());
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.56, 18, 16), this.monsterMaterial.clone());
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), this.monsterMaterial.clone());
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), this.monsterEyeMaterial.clone());
    const eyeR = eyeL.clone();
    body.position.set(0, 0.12, 0.08);
    body.rotation.z = 0.08;
    belly.position.set(0, -0.18, 0.18);
    belly.scale.set(1, 0.9, 1.05);
    head.position.set(0, 0.96, 0.52);
    jaw.position.set(0, 0.68, 0.94);
    jaw.scale.set(1.35, 0.72, 1.5);
    eyeL.position.set(-0.16, 1.02, 0.98);
    eyeR.position.set(0.16, 1.02, 0.98);

    [
      { x: -0.84, y: -0.12, z: 0.28, rz: 0.94 },
      { x: 0.84, y: -0.12, z: 0.28, rz: -0.94 }
    ].forEach((arm) => {
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 10), this.monsterMaterial.clone());
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.52, 8), this.monsterMaterial.clone());
      limb.position.set(arm.x, arm.y, arm.z);
      limb.rotation.z = arm.rz;
      limb.rotation.x = 0.32;
      claw.position.set(arm.x + Math.sign(arm.x) * 0.55, arm.y - 0.56, arm.z + 0.34);
      claw.rotation.z = arm.rz;
      claw.rotation.x = 0.22;
      limb.castShadow = true;
      claw.castShadow = true;
      this.monsterGroup.add(limb, claw);
    });

    [
      { x: -0.34, z: 0.12, rz: 0.12 },
      { x: 0.34, z: 0.12, rz: -0.12 }
    ].forEach((leg) => {
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.18, 10), this.monsterMaterial.clone());
      limb.position.set(leg.x, -1.02, leg.z);
      limb.rotation.z = leg.rz;
      limb.castShadow = true;
      this.monsterGroup.add(limb);
    });

    [body, belly, head, jaw, eyeL, eyeR].forEach((part) => {
      part.castShadow = true;
      part.receiveShadow = true;
    });

    this.monsterGroup.add(body, belly, head, jaw, eyeL, eyeR);
    this.root.add(this.monsterGroup);
  }

  _buildQuestionCard() {
    const material = new THREE.MeshBasicMaterial({
      map: this.questionTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(this.cellSize * 1.18, this.cellSize * 1.18),
      material
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.05;
    plane.renderOrder = 4;
    plane.visible = false;
    this.root.add(plane);
    this.questionPlane = plane;
  }

  _buildButtresses(center, width, depth, wallThickness) {
    const anchors = [];
    const stepX = Math.max(1, Math.floor(this.floorData.config.width / 2));
    const stepY = Math.max(1, Math.floor(this.floorData.config.height / 3));

    for (let x = 0; x < this.floorData.config.width; x += stepX) {
      anchors.push({
        x: center.x - width / 2 + this.cellSize * 0.5 + x * this.cellSize,
        z: center.z - depth / 2 + wallThickness * 0.35
      });
      anchors.push({
        x: center.x - width / 2 + this.cellSize * 0.5 + x * this.cellSize,
        z: center.z + depth / 2 - wallThickness * 0.35
      });
    }

    for (let y = 1; y < this.floorData.config.height - 1; y += stepY) {
      anchors.push({
        x: center.x - width / 2 + wallThickness * 0.35,
        z: center.z - depth / 2 + this.cellSize * 0.5 + y * this.cellSize
      });
      anchors.push({
        x: center.x + width / 2 - wallThickness * 0.35,
        z: center.z - depth / 2 + this.cellSize * 0.5 + y * this.cellSize
      });
    }

    const seen = new Set();
    anchors.forEach((anchor) => {
      const key = `${anchor.x.toFixed(2)}:${anchor.z.toFixed(2)}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);

      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, this.ceilingY + 0.26, 0.7),
        this.columnMaterial.clone()
      );
      pillar.position.set(anchor.x, this.ceilingY * 0.5, anchor.z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.root.add(pillar);

      if (this._noise(anchor.x, anchor.z, 41) > 0.48) {
        const moss = new THREE.Mesh(
          new THREE.PlaneGeometry(0.56, 1.48),
          this.mossMaterial.clone()
        );
        moss.position.set(anchor.x, 1.28 + this._noise(anchor.x, anchor.z, 43) * 1.1, anchor.z + 0.36);
        moss.rotation.y = this._noise(anchor.x, anchor.z, 47) * 0.35;
        this.root.add(moss);
      }
    });
  }

  _buildWallTorches(center, width, depth, wallThickness) {
    const anchors = [
      { x: center.x - width * 0.24, y: 3.2, z: center.z - depth / 2 + wallThickness * 0.86, rot: 0 },
      { x: center.x + width * 0.24, y: 3.55, z: center.z - depth / 2 + wallThickness * 0.86, rot: 0 },
      { x: center.x - width * 0.22, y: 3.25, z: center.z + depth / 2 - wallThickness * 0.86, rot: Math.PI },
      { x: center.x + width * 0.22, y: 3.5, z: center.z + depth / 2 - wallThickness * 0.86, rot: Math.PI },
      { x: center.x - width / 2 + wallThickness * 0.86, y: 3.35, z: center.z - depth * 0.18, rot: -Math.PI / 2 },
      { x: center.x + width / 2 - wallThickness * 0.86, y: 3.45, z: center.z + depth * 0.18, rot: Math.PI / 2 }
    ];

    anchors.forEach((anchor, index) => {
      const torch = new THREE.Group();
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.12), this.torchBracketMaterial.clone());
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.24, 10), this.hatchRingMaterial.clone());
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), this.torchFlameMaterial.clone());
      mount.position.set(0, 0, 0.08);
      bowl.position.set(0, 0.18, 0.22);
      flame.position.set(0, 0.42, 0.26);
      flame.scale.set(0.78, 1.6, 0.78);
      torch.add(mount, bowl, flame);
      torch.position.set(anchor.x, anchor.y, anchor.z);
      torch.rotation.y = anchor.rot;
      this.root.add(torch);

      const light = new THREE.PointLight(0xe5933a, 0.9, 14, 1.9);
      light.position.set(anchor.x, anchor.y + 0.36, anchor.z);
      this.root.add(light);
      this.wallTorches.push({ light, flame, seed: index * 1.37 });
    });
  }

  _buildMoteField() {
    const count = Math.max(36, this.floorData.activeTiles.length * 4);
    const config = this.floorData.config;
    const width = config.width * this.cellSize;
    const depth = config.height * this.cellSize;
    const center = this.cellToWorld((config.width - 1) / 2, (config.height - 1) / 2);
    const positions = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = center.x + (this._noise(index, 0, 53) - 0.5) * width * 0.95;
      positions[index * 3 + 1] = 0.7 + this._noise(index, 0, 59) * (this.ceilingY - 1.8);
      positions[index * 3 + 2] = center.z + (this._noise(index, 0, 61) - 0.5) * depth * 0.95;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x68705f,
      size: 0.12,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    });
    this.moteField = new THREE.Points(geometry, material);
    this.root.add(this.moteField);
  }

  _noise(x, y, seed = 0) {
    const value = Math.sin((x + seed * 0.13) * 127.1 + (y - seed * 0.07) * 311.7 + seed * 19.19) * 43758.5453123;
    return value - Math.floor(value);
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

  _getFacingYaw(facing) {
    return [0, -Math.PI / 2, Math.PI, Math.PI / 2][facing] || 0;
  }

  setPlayerState(player, instant = false) {
    this.playerState = { ...player };
    const world = this.cellToWorld(player.x, player.y);
    this.playerTarget.set(world.x, this.eyeHeight, world.z);
    this.targetYaw = typeof player.cameraYaw === 'number' ? player.cameraYaw : this._getFacingYaw(player.facing);
    const pitchOffset = typeof player.cameraPitch === 'number' ? player.cameraPitch : 0;
    const basePitch = this.snapshot?.question?.active ? -0.58 : player.lookMode === 'up' ? 0.54 : -0.08;
    this.targetPitch = Math.max(-1.22, Math.min(1.02, basePitch + pitchOffset));
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

  pickQuestionOption() {
    const intersection = this._getQuestionIntersection();
    return this._getQuestionOptionFromIntersection(intersection);
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
    const bob = this.snapshot?.question?.active ? Math.sin(this.clock.elapsedTime * 6) * 0.002 : Math.sin(this.clock.elapsedTime * 6) * 0.01;

    this.camera.position.set(
      this.playerRender.x + (Math.random() - 0.5) * shake,
      this.playerRender.y + bob + (Math.random() - 0.5) * shake * 0.45,
      this.playerRender.z + (Math.random() - 0.5) * shake
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + (Math.random() - 0.5) * shake * 0.16;

    if (this.moteField) {
      this.moteField.rotation.y += deltaSeconds * 0.02;
      this.moteField.position.y = Math.sin(this.clock.elapsedTime * 0.35) * 0.08;
    }

    this.wallTorches.forEach((torch) => {
      const flicker = 0.82 + Math.sin(this.clock.elapsedTime * 5.2 + torch.seed) * 0.12;
      torch.light.intensity = flicker;
      torch.flame.scale.y = 1.45 + Math.sin(this.clock.elapsedTime * 7 + torch.seed * 1.7) * 0.18;
    });

    this._updateQuestionHover();
  }

  _applySnapshot() {
    const { floorData, monster, quake, now, player, question } = this.snapshot;

    this.setPlayerState(player);

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
    const targetY = monster.state === 'ceiling' ? this.ceilingY - 1.08 : monster.state === 'stunned' ? 1.02 : 1.28;
    this.monsterGroup.position.lerp(new THREE.Vector3(monsterWorld.x, targetY, monsterWorld.z), 0.18);
    this.monsterGroup.rotation.x = monster.state === 'ceiling' ? Math.PI : 0;
    this.monsterGroup.scale.setScalar(monster.state === 'stunned' ? 1.12 : 1);

    const pulse = 0.22 + Math.sin(this.clock.elapsedTime * 6) * 0.08;
    this.monsterGroup.children.forEach((child, index) => {
      if (child.material && child.material.emissiveIntensity !== undefined) {
        child.material.emissiveIntensity = 0.08 + pulse + index * 0.012;
      }
    });

    this.quakeLight.intensity = quake.phase === 'warning' ? 0.9 : quake.phase === 'active' ? 1.5 : 0;
    this.torchLight.position.set(
      this.playerRender.x + Math.sin(this.yaw + 0.45) * 0.62,
      this.playerRender.y + 0.7,
      this.playerRender.z + Math.cos(this.yaw + 0.45) * 0.62
    );
    this.torchLight.intensity = 1.2 + Math.sin(this.clock.elapsedTime * 4.2) * 0.08;
    this.fillLight.position.set(this.playerRender.x - 1.2, 1.2, this.playerRender.z - 1.1);
    this._updateQuestionCard(question, player);
  }

  _updateQuestionCard(question, player) {
    if (!this.questionPlane || !question?.active || !question.options?.length) {
      if (this.questionPlane) {
        this.questionPlane.visible = false;
      }
      if (this.questionHoverIndex !== -1) {
        this.questionHoverIndex = -1;
        this.questionSignature = '';
      }
      return;
    }

    const world = this.cellToWorld(player.x, player.y);
    const panelYaw = typeof question.panelYaw === 'number' ? question.panelYaw : 0;
    const forwardOffset = this.cellSize * 0.18;
    this.questionPlane.visible = true;
    this.questionPlane.position.set(
      world.x + Math.sin(panelYaw) * forwardOffset,
      0.05,
      world.z + Math.cos(panelYaw) * forwardOffset
    );
    this.questionPlane.rotation.set(-Math.PI / 2, panelYaw, 0);

    const nextSignature = JSON.stringify({
      topic: question.topic,
      level: question.level,
      text: question.text,
      display: question.display,
      options: question.options,
      selectedIndex: question.selectedIndex,
      correctIndex: question.correctIndex,
      hoverIndex: this.questionHoverIndex,
      feedback: question.feedback
    });

    if (nextSignature !== this.questionSignature) {
      this.questionSignature = nextSignature;
      this._renderQuestionCard(question);
    }
  }

  _updateQuestionHover() {
    if (!this.snapshot?.question?.active || !this.questionPlane?.visible || this.snapshot.question.selectedIndex !== null) {
      if (this.questionHoverIndex !== -1) {
        this.questionHoverIndex = -1;
        this.questionSignature = '';
      }
      return;
    }

    const nextHoverIndex = this.pickQuestionOption();
    if (nextHoverIndex !== this.questionHoverIndex) {
      this.questionHoverIndex = nextHoverIndex === null ? -1 : nextHoverIndex;
      this.questionSignature = '';
    }
  }

  _getQuestionIntersection() {
    if (!this.questionPlane?.visible) {
      return null;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const [intersection] = this.raycaster.intersectObject(this.questionPlane, false);
    return intersection || null;
  }

  _getQuestionOptionFromIntersection(intersection) {
    if (!intersection?.uv || !this.questionOptionRects.length) {
      return null;
    }

    const x = intersection.uv.x * this.questionCanvas.width;
    const y = (1 - intersection.uv.y) * this.questionCanvas.height;

    const index = this.questionOptionRects.findIndex((rect) => (
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    ));

    return index === -1 ? null : index;
  }

  _renderQuestionCard(question) {
    const ctx = this.questionContext;
    const width = this.questionCanvas.width;
    const height = this.questionCanvas.height;
    const padding = 88;
    const innerWidth = width - padding * 2;
    const optionGap = 20;
    const optionHeight = 126;
    const optionWidth = innerWidth;
    const optionTop = height - padding - optionHeight * 4 - optionGap * 3 - 86;
    const selectedIndex = question.selectedIndex;
    const feedback = question.feedback;

    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, 'rgba(72, 59, 37, 0.96)');
    bg.addColorStop(1, 'rgba(38, 28, 18, 0.97)');
    ctx.fillStyle = bg;
    this._drawRoundedRect(ctx, 18, 18, width - 36, height - 36, 56);
    ctx.fill();

    [
      { x: width * 0.24, y: height * 0.32, r: 220, color: 'rgba(35, 55, 28, 0.16)' },
      { x: width * 0.74, y: height * 0.78, r: 180, color: 'rgba(27, 21, 12, 0.24)' },
      { x: width * 0.58, y: height * 0.18, r: 130, color: 'rgba(180, 118, 48, 0.08)' }
    ].forEach((stain) => {
      const gradient = ctx.createRadialGradient(stain.x, stain.y, 0, stain.x, stain.y, stain.r);
      gradient.addColorStop(0, stain.color);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    });

    ctx.strokeStyle = 'rgba(182, 147, 86, 0.55)';
    ctx.lineWidth = 6;
    this._drawRoundedRect(ctx, 32, 32, width - 64, height - 64, 42);
    ctx.stroke();

    ctx.fillStyle = '#e2c58a';
    ctx.font = '700 58px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(question.topic || 'Topic', width / 2, 112);

    ctx.fillStyle = 'rgba(231, 215, 182, 0.78)';
    ctx.font = '600 30px Georgia, serif';
    ctx.fillText(question.level || '', width / 2, 164);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f6ead4';
    ctx.font = '600 44px Georgia, serif';
    let cursorY = 248;
    cursorY = this._drawWrappedText(ctx, question.text || '', padding, cursorY, innerWidth, 54, 3);

    ctx.fillStyle = '#e8ca92';
    ctx.font = '700 48px Georgia, serif';
    cursorY += 22;
    this._drawWrappedText(ctx, question.display || '', padding, cursorY, innerWidth, 56, 2);

    this.questionOptionRects = [];
    ctx.font = '600 34px Georgia, serif';

    question.options.forEach((option, index) => {
      const x = padding;
      const y = optionTop + index * (optionHeight + optionGap);
      const hovered = selectedIndex === null && this.questionHoverIndex === index;
      const isCorrect = selectedIndex !== null && index === question.correctIndex;
      const isWrong = selectedIndex !== null && index === selectedIndex && selectedIndex !== question.correctIndex;

      const fill = isCorrect
        ? 'rgba(56, 97, 52, 0.94)'
        : isWrong
          ? 'rgba(104, 43, 35, 0.95)'
          : hovered
            ? 'rgba(118, 82, 33, 0.94)'
            : 'rgba(55, 40, 24, 0.92)';
      const stroke = isCorrect
        ? 'rgba(169, 220, 158, 0.88)'
        : isWrong
          ? 'rgba(220, 148, 137, 0.82)'
          : hovered
            ? 'rgba(232, 198, 128, 0.86)'
            : 'rgba(194, 163, 104, 0.26)';

      ctx.fillStyle = fill;
      this._drawRoundedRect(ctx, x, y, optionWidth, optionHeight, 22);
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = hovered ? 5 : 3;
      this._drawRoundedRect(ctx, x, y, optionWidth, optionHeight, 22);
      ctx.stroke();

      ctx.fillStyle = '#f7efde';
      ctx.font = '700 30px Georgia, serif';
      ctx.fillText(`${index + 1}.`, x + 28, y + 46);
      ctx.font = '600 34px Georgia, serif';
      this._drawWrappedText(ctx, option || '', x + 86, y + 42, optionWidth - 116, 38, 2);

      this.questionOptionRects.push({ x, y, width: optionWidth, height: optionHeight });
    });

    if (feedback?.text) {
      const feedbackY = height - padding - 26;
      ctx.fillStyle = feedback.isCorrect ? '#cbe2ba' : '#efb7a8';
      ctx.font = '700 26px Georgia, serif';
      ctx.textAlign = 'center';
      this._drawWrappedText(ctx, feedback.text, width / 2 - innerWidth / 2, feedbackY, innerWidth, 30, 2, 'center');
      ctx.textAlign = 'left';
    }

    this.questionTexture.needsUpdate = true;
  }

  _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines, align = 'left') {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        return;
      }
      if (line) {
        lines.push(line);
      }
      line = word;
    });

    if (line) {
      lines.push(line);
    }

    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines && visibleLines.length) {
      const lastIndex = visibleLines.length - 1;
      visibleLines[lastIndex] = `${visibleLines[lastIndex].replace(/[.…]*$/, '')}...`;
    }

    ctx.textAlign = align;
    visibleLines.forEach((lineText, index) => {
      const drawX = align === 'center' ? x + maxWidth / 2 : x;
      ctx.fillText(lineText, drawX, y + lineHeight * index);
    });
    ctx.textAlign = 'left';
    return y + visibleLines.length * lineHeight;
  }

  _drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
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
