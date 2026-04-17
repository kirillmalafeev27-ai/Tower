class TowerRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050604);
    this.scene.fog = new THREE.Fog(0x0a0c08, 12, 58);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 160);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
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
    this.boxNodeList = [];
    this.hatchNodes = Object.create(null);
    this.debrisNodes = Object.create(null);
    this.floorNodes = Object.create(null);
    this.monsterGroup = null;
    this.monsterPulseMaterials = [];
    this.monsterJawPivot = null;
    this.monsterEyeNodes = [];
    this.monsterTendrilNodes = [];
    this.wallTorches = [];
    this.moteField = null;
    this.questionPlane = null;
    this.questionPanelGroup = null;
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
    this.screenCenter = new THREE.Vector2(0, 0);
    this.pointerNdc = new THREE.Vector2(0, 0);
    this.pointerInsideCanvas = false;
    this.targetBoxBounds = new THREE.Box3();
    this.targetBoxHit = new THREE.Vector3();
    this.monsterTarget = new THREE.Vector3();
    this.targetHoverBoxKey = null;
    this.targetHoverDebrisKey = null;

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

    this.floorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorStoneMap, roughness: 0.68, metalness: 0.06 });
    this.floorInsetMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorInsetMap, roughness: 0.4, metalness: 0.08 });
    this.floorEdgeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallStoneMap, roughness: 0.82, metalness: 0.04 });
    this.puddleMaterial = new THREE.MeshStandardMaterial({ color: 0x141812, roughness: 0.04, metalness: 0.55, transparent: true, opacity: 0.92 });
    this.hatchRingMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ironMap, roughness: 0.32, metalness: 0.66 });
    this.hatchVoidMaterial = new THREE.MeshBasicMaterial({ color: 0x010101 });
    this.debrisMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: heavyCrateMap, roughness: 0.64, metalness: 0.06 });
    this.wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallStoneMap, roughness: 0.88, metalness: 0.02 });
    this.wallTrimMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: trimStoneMap, roughness: 0.54, metalness: 0.07 });
    this.ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ceilingStoneMap, roughness: 0.86, metalness: 0.02, emissive: 0x050403, emissiveIntensity: 0.35 });
    this.columnMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: trimStoneMap, roughness: 0.74, metalness: 0.04 });
    this.mossMaterial = new THREE.MeshStandardMaterial({ color: 0x23311f, roughness: 0.82, metalness: 0.02, transparent: true, opacity: 0.68, side: THREE.DoubleSide });
    this.torchBracketMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ironMap, roughness: 0.28, metalness: 0.76 });
    this.torchFlameMaterial = new THREE.MeshBasicMaterial({ color: 0xffa24a });
    this.monsterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x121a14,
      emissive: 0x060f09,
      roughness: 0.32,
      metalness: 0.02,
      clearcoat: 0.78,
      clearcoatRoughness: 0.22,
      reflectivity: 0.32
    });
    this.monsterWetMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x24382b,
      emissive: 0x0d1a13,
      roughness: 0.14,
      metalness: 0.02,
      clearcoat: 0.96,
      clearcoatRoughness: 0.06,
      reflectivity: 0.52
    });
    this.monsterBoneMaterial = new THREE.MeshStandardMaterial({ color: 0xd8c6a8, emissive: 0x2a1d10, roughness: 0.48, metalness: 0.03 });
    this.monsterClawMaterial = new THREE.MeshStandardMaterial({ color: 0x1e241f, emissive: 0x060a07, roughness: 0.22, metalness: 0.18 });
    this.monsterEyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffd890, emissive: 0xff5a18, emissiveIntensity: 1.4, roughness: 0.18, metalness: 0.05 });

    this.boxMaterials = {
      normal: new THREE.MeshStandardMaterial({ color: 0xffffff, map: normalCrateMap, roughness: 0.54, metalness: 0.06 }),
      light: new THREE.MeshStandardMaterial({ color: 0xffffff, map: lightCrateMap, roughness: 0.46, metalness: 0.05 }),
      anchor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ironMap, roughness: 0.28, metalness: 0.72 }),
      heavy: new THREE.MeshStandardMaterial({ color: 0xffffff, map: heavyCrateMap, roughness: 0.62, metalness: 0.08 }),
      rotten: new THREE.MeshStandardMaterial({ color: 0xffffff, map: rottenCrateMap, roughness: 0.58, metalness: 0.03 }),
      safe: new THREE.MeshStandardMaterial({ color: 0xffffff, map: safeCrateMap, roughness: 0.38, metalness: 0.18 })
    };
    this.floorRepairMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: heavyCrateMap, roughness: 0.56, metalness: 0.05 });
    this.crateInteriorMaterial = new THREE.MeshStandardMaterial({ color: 0x080503, roughness: 0.78, metalness: 0.02, emissive: 0x100804, emissiveIntensity: 0.22 });
  }

  _setupLights() {
    this.ambient = new THREE.HemisphereLight(0x3d4c3e, 0x050604, 0.4);
    this.scene.add(this.ambient);

    this.topLight = new THREE.DirectionalLight(0xb7b093, 0.92);
    this.topLight.position.set(-6, this.ceilingY + 5, -4);
    this.topLight.castShadow = true;
    this.topLight.shadow.mapSize.width = 2048;
    this.topLight.shadow.mapSize.height = 2048;
    this.topLight.shadow.camera.near = 0.5;
    this.topLight.shadow.camera.far = this.ceilingY + 18;
    this.topLight.shadow.bias = -0.0009;
    this.topLight.shadow.normalBias = 0.04;
    this.topLight.shadow.radius = 2.6;
    this.scene.add(this.topLight.target);
    this.scene.add(this.topLight);

    this.rimLight = new THREE.DirectionalLight(0xd89a5a, 0.58);
    this.rimLight.position.set(7, 4.8, 6);
    this.scene.add(this.rimLight.target);
    this.scene.add(this.rimLight);

    this.fillLight = new THREE.PointLight(0x365c48, 0.46, 56, 1.8);
    this.fillLight.position.set(0, 1.2, 0);
    this.scene.add(this.fillLight);

    this.torchLight = new THREE.PointLight(0xf0a14a, 2.35, 38, 1.7);
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
    this.boxNodeList = [];
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
    this.rimLight.position.set(
      center.x + floorData.config.width * this.cellSize * 0.22,
      3.8,
      center.z + floorData.config.height * this.cellSize * 0.18
    );
    this.rimLight.target.position.set(center.x, 1.6, center.z);
    this.rimLight.target.updateMatrixWorld();

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
    this.boxNodeList = [];
    this.wallTorches = [];
    this.moteField = null;
    this.monsterGroup = null;
    this.monsterPulseMaterials = [];
    this.monsterJawPivot = null;
    this.monsterEyeNodes = [];
    this.monsterTendrilNodes = [];
    this.questionPlane = null;
    this.questionPanelGroup = null;
    this.questionOptionRects = [];
    this.questionHoverIndex = -1;
    this.questionSignature = '';
    this.targetHoverBoxKey = null;
    this.targetHoverDebrisKey = null;
  }

  _buildTiles() {
    this.floorData.activeTiles.forEach((tile) => {
      const world = this.cellToWorld(tile.x, tile.y);
      const slabHeight = 0.94;
      const tiltX = (this._noise(tile.x, tile.y, 3) - 0.5) * 0.08;
      const tiltZ = (this._noise(tile.x, tile.y, 5) - 0.5) * 0.08;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(this.cellSize, slabHeight, this.cellSize), this.floorEdgeMaterial.clone());
      slab.position.set(world.x, -slabHeight * 0.52, world.z);
      slab.castShadow = true;
      slab.receiveShadow = true;
      this.root.add(slab);

      const stoneHeight = 0.22 + this._noise(tile.x, tile.y, 7) * 0.14;
      const sunken = this._noise(tile.x, tile.y, 13) > 0.78;
      const stoneGeometry = new THREE.BoxGeometry(this.cellSize * 0.95, stoneHeight, this.cellSize * 0.95, 3, 1, 3);
      this._warpBoxGeometry(stoneGeometry, 0.06, 151 + tile.x * 7 + tile.y * 11);
      const stone = new THREE.Mesh(stoneGeometry, this.floorMaterial.clone());
      stone.position.set(
        world.x + (this._noise(tile.x, tile.y, 61) - 0.5) * 0.08,
        stoneHeight * 0.5 - 0.02 + this._noise(tile.x, tile.y, 9) * 0.05 - (sunken ? 0.06 : 0),
        world.z + (this._noise(tile.x, tile.y, 63) - 0.5) * 0.08
      );
      stone.rotation.x = tiltX;
      stone.rotation.z = tiltZ;
      stone.rotation.y = (this._noise(tile.x, tile.y, 11) - 0.5) * 0.14;
      stone.receiveShadow = true;
      this.root.add(stone);

      if (this._noise(tile.x, tile.y, 79) > 0.52) {
        const rubbleCount = 1 + Math.floor(this._noise(tile.x, tile.y, 81) * 2);
        for (let index = 0; index < rubbleCount; index += 1) {
          const rubbleGeometry = new THREE.BoxGeometry(
            0.14 + this._noise(index, tile.x, 83) * 0.22,
            0.06 + this._noise(index, tile.y, 85) * 0.08,
            0.14 + this._noise(index, tile.x + tile.y, 87) * 0.22,
            1, 1, 1
          );
          this._warpBoxGeometry(rubbleGeometry, 0.04, 89 + index * 3 + tile.x);
          const rubble = new THREE.Mesh(rubbleGeometry, this.floorEdgeMaterial.clone());
          rubble.position.set(
            world.x + (this._noise(index, tile.x, 91) - 0.5) * this.cellSize * 0.7,
            stone.position.y + stoneHeight * 0.5 + 0.04,
            world.z + (this._noise(index, tile.y, 93) - 0.5) * this.cellSize * 0.7
          );
          rubble.rotation.y = this._noise(index, tile.x + tile.y, 95) * Math.PI * 2;
          rubble.rotation.z = (this._noise(index, tile.x, 97) - 0.5) * 0.4;
          rubble.castShadow = true;
          rubble.receiveShadow = true;
          this.root.add(rubble);
        }
      }

      if (this._noise(tile.x, tile.y, 17) > 0.42) {
        const crack = new THREE.Mesh(
          new THREE.BoxGeometry(this.cellSize * 0.72, 0.04, 0.12 + this._noise(tile.x, tile.y, 19) * 0.08),
          this.floorInsetMaterial.clone()
        );
        crack.position.set(
          world.x + (this._noise(tile.x, tile.y, 23) - 0.5) * 0.3,
          stone.position.y + stoneHeight * 0.5 + 0.01,
          world.z + (this._noise(tile.x, tile.y, 29) - 0.5) * 0.3
        );
        crack.rotation.y = this._noise(tile.x, tile.y, 31) * Math.PI;
        crack.receiveShadow = true;
        this.root.add(crack);
      }

      if (this._noise(tile.x, tile.y, 37) > 0.64) {
        const plankCount = 2 + Math.floor(this._noise(tile.x, tile.y, 41) * 2);
        for (let index = 0; index < plankCount; index += 1) {
          const plank = new THREE.Mesh(
            new THREE.BoxGeometry(this.cellSize * 0.74, 0.08, 0.18),
            this.floorRepairMaterial.clone()
          );
          plank.position.set(
            world.x + (index - (plankCount - 1) * 0.5) * 0.18,
            stone.position.y + stoneHeight * 0.5 + 0.05 + index * 0.01,
            world.z + (this._noise(tile.x, index, 43) - 0.5) * 0.18
          );
          plank.rotation.y = Math.PI / 2 + (this._noise(tile.x, tile.y, 47) - 0.5) * 0.08;
          plank.rotation.z = (this._noise(index, tile.y, 53) - 0.5) * 0.04;
          plank.castShadow = true;
          plank.receiveShadow = true;
          this.root.add(plank);
        }
      }

      this.floorNodes[tileKey(tile.x, tile.y)] = stone;
    });
  }

  _buildWalls() {
    const config = this.floorData.config;
    const width = config.width * this.cellSize;
    const depth = config.height * this.cellSize;
    const center = this.cellToWorld((config.width - 1) / 2, (config.height - 1) / 2);
    const wallThickness = 1.18;
    const wallHeight = this.ceilingY + 0.9;

    const walls = [
      { x: center.x, z: center.z - depth / 2, w: width + wallThickness * 1.8, d: wallThickness, r: 0, axis: 'z', sign: 1 },
      { x: center.x, z: center.z + depth / 2, w: width + wallThickness * 1.8, d: wallThickness, r: 0, axis: 'z', sign: -1 },
      { x: center.x - width / 2, z: center.z, w: depth + wallThickness * 1.8, d: wallThickness, r: Math.PI / 2, axis: 'x', sign: 1 },
      { x: center.x + width / 2, z: center.z, w: depth + wallThickness * 1.8, d: wallThickness, r: Math.PI / 2, axis: 'x', sign: -1 }
    ];

    walls.forEach((wall, wallIndex) => {
      const baseGeometry = new THREE.BoxGeometry(wall.w, wallHeight, wall.d, 8, 8, 2);
      this._warpBoxGeometry(baseGeometry, 0.14, 811 + wallIndex * 31);
      const mesh = new THREE.Mesh(baseGeometry, this.wallMaterial.clone());
      mesh.position.set(wall.x, wallHeight / 2 - 0.22, wall.z);
      mesh.rotation.y = wall.r;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);

      const plinthGeometry = new THREE.BoxGeometry(wall.w * 0.97, 0.82, wall.d + 0.26, 6, 2, 2);
      this._warpBoxGeometry(plinthGeometry, 0.06, 823 + wallIndex * 29);
      const plinth = new THREE.Mesh(plinthGeometry, this.wallTrimMaterial.clone());
      plinth.position.set(wall.x, 0.28, wall.z);
      plinth.rotation.y = wall.r;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      this.root.add(plinth);

      const beltGeometry = new THREE.BoxGeometry(wall.w * 0.94, 0.26, wall.d + 0.18, 6, 1, 2);
      this._warpBoxGeometry(beltGeometry, 0.04, 829 + wallIndex * 29);
      const belt = new THREE.Mesh(beltGeometry, this.wallTrimMaterial.clone());
      belt.position.set(wall.x, wallHeight * 0.38, wall.z);
      belt.rotation.y = wall.r;
      belt.receiveShadow = true;
      belt.castShadow = true;
      this.root.add(belt);

      const crownGeometry = new THREE.BoxGeometry(wall.w * 0.93, 0.54, wall.d + 0.34, 6, 2, 2);
      this._warpBoxGeometry(crownGeometry, 0.05, 833 + wallIndex * 29);
      const crown = new THREE.Mesh(crownGeometry, this.wallTrimMaterial.clone());
      crown.position.set(wall.x, wallHeight - 0.42, wall.z);
      crown.rotation.y = wall.r;
      crown.castShadow = true;
      crown.receiveShadow = true;
      this.root.add(crown);

      const courses = 5;
      const courseHeight = (wallHeight - 1.2) / courses;
      const wallLength = wall.w - 0.6;
      for (let course = 0; course < courses; course += 1) {
        const stagger = course % 2 === 0 ? 0 : 0.5;
        const blocksPerCourse = 6;
        const blockWidth = wallLength / blocksPerCourse;
        for (let block = 0; block < blocksPerCourse + (stagger ? 1 : 0); block += 1) {
          const seed = 841 + wallIndex * 97 + course * 31 + block * 11;
          if (this._noise(wallIndex, course * 10 + block, 853) < 0.14) {
            continue;
          }
          const bw = blockWidth * (0.78 + this._noise(seed, 0, 857) * 0.26);
          const bh = courseHeight * (0.7 + this._noise(seed, 1, 859) * 0.24);
          const bd = 0.22 + this._noise(seed, 2, 863) * 0.12;
          const blockGeometry = new THREE.BoxGeometry(bw, bh, bd, 2, 1, 1);
          this._warpBoxGeometry(blockGeometry, 0.05, seed);
          const stone = new THREE.Mesh(blockGeometry, this.wallMaterial.clone());
          const local = -wallLength * 0.5 + (block - stagger) * blockWidth + blockWidth * 0.5;
          const innerOffset = wall.d * 0.5 + bd * 0.5 - 0.05;
          const baseY = 0.7 + course * courseHeight + courseHeight * 0.5 + (this._noise(seed, 3, 877) - 0.5) * 0.06;
          if (wall.axis === 'z') {
            stone.position.set(wall.x + local, baseY, wall.z + wall.sign * innerOffset);
          } else {
            stone.position.set(wall.x + wall.sign * innerOffset, baseY, wall.z + local);
            stone.rotation.y = Math.PI / 2;
          }
          stone.rotation.z = (this._noise(seed, 4, 881) - 0.5) * 0.04;
          stone.rotation.x = (this._noise(seed, 5, 883) - 0.5) * 0.02;
          stone.castShadow = true;
          stone.receiveShadow = true;
          if (this._noise(seed, 6, 887) < 0.12) {
            stone.material.color.offsetHSL(0, -0.05, -0.12);
          }
          this.root.add(stone);
        }
      }

      if (this._noise(wallIndex, 0, 911) > 0.35) {
        const mossCount = 2 + Math.floor(this._noise(wallIndex, 1, 913) * 3);
        for (let index = 0; index < mossCount; index += 1) {
          const moss = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8 + this._noise(wallIndex, index, 917) * 0.7, 1.4 + this._noise(wallIndex, index, 919) * 0.9),
            this.mossMaterial.clone()
          );
          const local = (this._noise(wallIndex, index, 923) - 0.5) * wall.w * 0.76;
          const mossY = 1.6 + this._noise(wallIndex, index, 929) * (wallHeight - 3.2);
          const mossInner = wall.d * 0.5 + 0.01;
          if (wall.axis === 'z') {
            moss.position.set(wall.x + local, mossY, wall.z + wall.sign * mossInner);
            moss.rotation.y = wall.sign > 0 ? 0 : Math.PI;
          } else {
            moss.position.set(wall.x + wall.sign * mossInner, mossY, wall.z + local);
            moss.rotation.y = wall.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
          moss.rotation.z = (this._noise(wallIndex, index, 937) - 0.5) * 0.2;
          moss.receiveShadow = true;
          this.root.add(moss);
        }
      }
    });

    this._buildCeiling(center, width, depth, wallThickness);
    this._buildFallenMasonry(center, width, depth, wallThickness);
    this._buildButtresses(center, width, depth, wallThickness);
    this._buildWallTorches(center, width, depth, wallThickness);
  }

  _buildCeiling(center, width, depth, wallThickness) {
    const ceilingGeometry = new THREE.BoxGeometry(
      width + wallThickness * 2.6,
      1.2,
      depth + wallThickness * 2.6,
      Math.max(4, this.floorData.config.width),
      2,
      Math.max(4, this.floorData.config.height)
    );
    this._warpBoxGeometry(ceilingGeometry, 0.09, 601);
    const ceiling = new THREE.Mesh(ceilingGeometry, this.ceilingMaterial.clone());
    ceiling.position.set(center.x, this.ceilingY + 0.52, center.z);
    ceiling.castShadow = true;
    ceiling.receiveShadow = true;
    this.root.add(ceiling);

    const config = this.floorData.config;
    for (let index = 0; index < config.width; index += 2) {
      const beamGeometry = new THREE.BoxGeometry(0.48, 0.78, depth + wallThickness * 1.4, 1, 2, 6);
      this._warpBoxGeometry(beamGeometry, 0.04, 611 + index * 13);
      const beam = new THREE.Mesh(beamGeometry, this.wallTrimMaterial.clone());
      beam.position.set(
        center.x - width / 2 + this.cellSize * 0.5 + index * this.cellSize,
        this.ceilingY - 0.48,
        center.z
      );
      beam.castShadow = true;
      beam.receiveShadow = true;
      this.root.add(beam);
    }

    for (let index = 1; index < config.height; index += 2) {
      const crossGeometry = new THREE.BoxGeometry(width + wallThickness * 1.4, 0.3, 0.34, 6, 1, 1);
      this._warpBoxGeometry(crossGeometry, 0.03, 617 + index * 13);
      const cross = new THREE.Mesh(crossGeometry, this.wallTrimMaterial.clone());
      cross.position.set(
        center.x,
        this.ceilingY - 0.2,
        center.z - depth / 2 + this.cellSize * 0.5 + index * this.cellSize
      );
      cross.castShadow = true;
      cross.receiveShadow = true;
      this.root.add(cross);
    }

    const stalCount = 4 + Math.floor(this._noise(config.width, config.height, 623) * 3);
    for (let index = 0; index < stalCount; index += 1) {
      const stalHeight = 0.4 + this._noise(index, config.width, 631) * 0.7;
      const stal = new THREE.Mesh(
        this._warpOrganicGeometry(new THREE.ConeGeometry(0.12 + this._noise(index, 0, 637) * 0.1, stalHeight, 7), 0.04, 641 + index * 9),
        this.ceilingMaterial.clone()
      );
      stal.position.set(
        center.x + (this._noise(index, 1, 643) - 0.5) * width * 0.8,
        this.ceilingY - stalHeight * 0.5 - 0.08,
        center.z + (this._noise(index, 2, 647) - 0.5) * depth * 0.8
      );
      stal.rotation.x = Math.PI;
      stal.rotation.z = (this._noise(index, 3, 653) - 0.5) * 0.2;
      stal.castShadow = true;
      stal.receiveShadow = true;
      this.root.add(stal);
    }
  }

  _buildFallenMasonry(center, width, depth, wallThickness) {
    const count = 6 + Math.floor(this._noise(this.floorData.config.width, this.floorData.config.height, 701) * 4);
    for (let index = 0; index < count; index += 1) {
      const side = Math.floor(this._noise(index, 0, 707) * 4);
      const along = (this._noise(index, 1, 709) - 0.5) * 0.9;
      const inset = 0.2 + this._noise(index, 2, 711) * 0.7;
      let px = center.x;
      let pz = center.z;
      if (side === 0) {
        px = center.x + along * width * 0.5;
        pz = center.z - depth * 0.5 + wallThickness * 0.5 + inset;
      } else if (side === 1) {
        px = center.x + along * width * 0.5;
        pz = center.z + depth * 0.5 - wallThickness * 0.5 - inset;
      } else if (side === 2) {
        px = center.x - width * 0.5 + wallThickness * 0.5 + inset;
        pz = center.z + along * depth * 0.5;
      } else {
        px = center.x + width * 0.5 - wallThickness * 0.5 - inset;
        pz = center.z + along * depth * 0.5;
      }

      const chunkWidth = 0.35 + this._noise(index, 3, 717) * 0.5;
      const chunkHeight = 0.2 + this._noise(index, 4, 719) * 0.32;
      const chunkDepth = 0.3 + this._noise(index, 5, 723) * 0.5;
      const geometry = new THREE.BoxGeometry(chunkWidth, chunkHeight, chunkDepth, 2, 1, 2);
      this._warpBoxGeometry(geometry, 0.08, 727 + index * 7);
      const chunk = new THREE.Mesh(geometry, this.wallMaterial.clone());
      chunk.position.set(px, chunkHeight * 0.5 + 0.02, pz);
      chunk.rotation.x = (this._noise(index, 6, 733) - 0.5) * 0.3;
      chunk.rotation.y = this._noise(index, 7, 739) * Math.PI * 2;
      chunk.rotation.z = (this._noise(index, 8, 743) - 0.5) * 0.4;
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      this.root.add(chunk);
    }
  }

  _buildHatches() {
    this.floorData.hatches.forEach((hatch) => {
      const key = tileKey(hatch.x, hatch.y);
      const world = this.cellToWorld(hatch.x, hatch.y);
      const floorNode = this.floorNodes[key];
      const floorTop = floorNode
        ? floorNode.position.y + ((floorNode.geometry?.parameters?.height || 0.2) * 0.5)
        : 0.08;
      const group = new THREE.Group();
      const apron = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 0.05, 32),
        this.floorInsetMaterial.clone()
      );
      apron.material.color.offsetHSL(0.02, 0.04, -0.04);
      const ringMaterial = this.hatchRingMaterial.clone();
      ringMaterial.roughness = 0.2;
      ringMaterial.metalness = 0.82;
      ringMaterial.emissive = new THREE.Color(0x3b2410);
      ringMaterial.emissiveIntensity = 0.28;
      const innerRingMaterial = this.torchBracketMaterial.clone();
      innerRingMaterial.roughness = 0.16;
      innerRingMaterial.metalness = 0.86;
      innerRingMaterial.emissive = new THREE.Color(0x512a0d);
      innerRingMaterial.emissiveIntensity = 0.45;
      const lidMaterial = this.hatchRingMaterial.clone();
      lidMaterial.color.offsetHSL(0, -0.02, -0.14);
      lidMaterial.roughness = 0.26;
      lidMaterial.metalness = 0.72;

      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.08, 32), ringMaterial);
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 28), innerRingMaterial);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.26, 28), this.hatchVoidMaterial.clone());
      const lidPivot = new THREE.Group();
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.09, 28), lidMaterial);
      const braceA = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.12), innerRingMaterial.clone());
      const braceB = braceA.clone();
      const handleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14), innerRingMaterial.clone());
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.028, 8, 18), ringMaterial.clone());

      apron.position.y = 0.01;
      ring.position.y = 0.05;
      lip.position.y = 0.085;
      hole.position.y = -0.07;
      hole.visible = hatch.opened;
      lidPivot.position.set(0, 0.11, 0);
      braceA.position.y = 0.05;
      braceB.position.y = 0.05;
      braceB.rotation.y = Math.PI / 2;
      handleBase.position.y = 0.085;
      handle.position.y = 0.15;
      handle.rotation.x = Math.PI / 2;

      for (let index = 0; index < 6; index += 1) {
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10),
          innerRingMaterial.clone()
        );
        const angle = (Math.PI * 2 * index) / 6;
        bolt.position.set(Math.cos(angle) * 0.44, 0.075, Math.sin(angle) * 0.44);
        lidPivot.add(bolt);
      }

      apron.receiveShadow = true;
      [ring, lip, lid, braceA, braceB, handleBase, handle].forEach((mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });

      lidPivot.add(lid, braceA, braceB, handleBase, handle);
      group.position.set(world.x, floorTop + 0.01, world.z);
      group.add(apron, hole, ring, lip, lidPivot);
      this.root.add(group);
      this.hatchNodes[key] = { group, lid: lidPivot, hole };
    });
  }

  _buildBoxes() {
    this.floorData.boxList.forEach((box) => {
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
      const emissiveMaterials = this._buildHorrorCrate(group, dims, box);

      const baseY = this.ceilingY - dims[1] * 0.5 - 0.16;
      const baseRotationX = (this._noise(box.x, box.y, 67) - 0.5) * 0.06;
      const baseRotationZ = (this._noise(box.x, box.y, 71) - 0.5) * 0.09;
      group.position.set(world.x, baseY, world.z);
      group.rotation.x = baseRotationX;
      group.rotation.z = baseRotationZ;
      group.userData.boxKey = box.key;
      group.traverse((child) => {
        child.userData.boxKey = box.key;
        if (child !== group) {
          child.matrixAutoUpdate = false;
          child.updateMatrix();
        }
      });
      this.root.add(group);
      const node = {
        group,
        boxKey: box.key,
        boxX: box.x,
        boxY: box.y,
        boxHeight: dims[1],
        emissiveMaterials,
        targetHalfSize: {
          x: dims[0] * 0.68,
          y: dims[1] * 0.9,
          z: dims[2] * 0.68
        },
        baseY,
        baseRotationX,
        baseRotationZ,
        dropDirection: this._noise(box.x, box.y, 73) > 0.5 ? 1 : -1,
        swaySeed: this._noise(box.x, box.y, 79) * Math.PI * 2
      };
      this.boxNodes[box.key] = node;
      this.boxNodeList.push(node);
    });
  }

  _getCrateStyleProfile(type) {
    const profiles = {
      normal: { panelDepth: 0.16, frameThickness: 0.12, frontBoards: 4, sideBoards: 3, lidBoards: 3, bandCount: 2, lean: 0.08, lidLift: 0.14, splinterCount: 3, gapFront: false, gapSide: false, lidBreakIndex: 1, faceCross: false },
      light: { panelDepth: 0.12, frameThickness: 0.1, frontBoards: 3, sideBoards: 2, lidBoards: 3, bandCount: 1, lean: 0.14, lidLift: 0.24, splinterCount: 4, gapFront: true, gapSide: true, lidBreakIndex: 2, faceCross: false },
      anchor: { panelDepth: 0.16, frameThickness: 0.16, frontBoards: 3, sideBoards: 3, lidBoards: 3, bandCount: 3, lean: 0.05, lidLift: 0.1, splinterCount: 2, gapFront: false, gapSide: false, lidBreakIndex: 1, faceCross: false, cageBars: true, chain: true },
      heavy: { panelDepth: 0.18, frameThickness: 0.14, frontBoards: 4, sideBoards: 3, lidBoards: 4, bandCount: 3, lean: 0.06, lidLift: 0.12, splinterCount: 2, gapFront: false, gapSide: false, lidBreakIndex: 1, faceCross: true },
      rotten: { panelDepth: 0.12, frameThickness: 0.1, frontBoards: 4, sideBoards: 3, lidBoards: 2, bandCount: 1, lean: 0.22, lidLift: 0.34, splinterCount: 6, gapFront: true, gapSide: true, lidBreakIndex: 0, faceCross: false, hangingBoard: true },
      safe: { panelDepth: 0.15, frameThickness: 0.12, frontBoards: 3, sideBoards: 3, lidBoards: 3, bandCount: 2, lean: 0.05, lidLift: 0.08, splinterCount: 2, gapFront: false, gapSide: false, lidBreakIndex: 1, faceCross: false, safePlate: true }
    };

    return profiles[type] || profiles.normal;
  }

  _createCrateMaterialSet(box) {
    const wood = this.boxMaterials[box.type].clone();
    const trim = this.wallTrimMaterial.clone();
    const metal = (box.type === 'anchor' || box.type === 'safe' ? this.hatchRingMaterial : this.torchBracketMaterial).clone();
    const interior = this.crateInteriorMaterial.clone();

    wood.roughness = Math.max(0.24, wood.roughness * 0.9);
    wood.metalness = Math.min(0.18, wood.metalness + 0.03);
    trim.roughness = Math.max(0.26, trim.roughness * 0.88);
    trim.metalness = Math.min(0.14, trim.metalness + 0.02);
    metal.roughness = Math.max(0.14, metal.roughness * 0.8);
    metal.metalness = Math.min(0.85, metal.metalness + 0.08);

    return { wood, trim, metal, interior };
  }

  _createShapedPlankGeometry(width, height, depth, shaping = {}) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const positions = geometry.attributes.position;
    const {
      topInsetLeft = 0,
      topInsetRight = 0,
      bottomInsetLeft = 0,
      bottomInsetRight = 0,
      topLiftLeft = 0,
      topLiftRight = 0,
      bottomDropLeft = 0,
      bottomDropRight = 0,
      sideShear = 0
    } = shaping;

    for (let index = 0; index < positions.count; index += 1) {
      let x = positions.getX(index);
      let y = positions.getY(index);
      const z = positions.getZ(index);

      if (y > 0) {
        if (x < 0) {
          x += topInsetLeft;
          y += topLiftLeft;
        } else {
          x -= topInsetRight;
          y += topLiftRight;
        }
      } else if (x < 0) {
        x += bottomInsetLeft;
        y -= bottomDropLeft;
      } else {
        x -= bottomInsetRight;
        y -= bottomDropRight;
      }

      positions.setXYZ(index, x + (z / Math.max(0.001, depth * 0.5)) * sideShear, y, z);
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  _buildHorrorCrate(group, dims, box) {
    const [width, height, depth] = dims;
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    const halfD = depth * 0.5;
    const profile = this._getCrateStyleProfile(box.type);
    const materials = this._createCrateMaterialSet(box);
    const emissiveMaterials = [materials.wood, materials.trim, materials.metal];

    const cavity = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.7, height * 0.76, depth * 0.7),
      materials.interior
    );
    cavity.position.y = -0.04;
    cavity.receiveShadow = true;
    group.add(cavity);

    [
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
      { x: 1, z: 1 }
    ].forEach((corner, index) => {
      const postHeight = height * (0.84 + this._noise(box.x + index, box.y, 171) * 0.18);
      const post = new THREE.Mesh(
        this._createShapedPlankGeometry(
          profile.frameThickness,
          postHeight,
          profile.frameThickness,
          {
            topInsetLeft: profile.frameThickness * 0.12 * this._noise(index, box.x, 173),
            topInsetRight: profile.frameThickness * 0.12 * this._noise(index, box.y, 179),
            topLiftLeft: postHeight * 0.06 * this._noise(index, box.x + box.y, 181),
            topLiftRight: postHeight * 0.06 * this._noise(index, box.x - box.y, 183)
          }
        ),
        materials.trim
      );
      post.position.set(
        corner.x * (halfW - profile.frameThickness * 0.55),
        (this._noise(index, box.x, 191) - 0.5) * height * 0.06,
        corner.z * (halfD - profile.frameThickness * 0.55)
      );
      post.rotation.x = (this._noise(index, box.y, 193) - 0.5) * profile.lean * 0.5;
      post.rotation.z = (this._noise(index, box.x + box.y, 197) - 0.5) * profile.lean * 0.9;
      post.castShadow = true;
      post.receiveShadow = true;
      group.add(post);
    });

    const frontGapIndex = profile.gapFront ? Math.min(profile.frontBoards - 1, Math.floor(this._noise(box.x, box.y, 199) * profile.frontBoards)) : -1;
    const sideGapIndex = profile.gapSide ? Math.min(profile.sideBoards - 1, Math.floor(this._noise(box.y, box.x, 211) * profile.sideBoards)) : -1;

    [
      { name: 'front', direction: 1 },
      { name: 'back', direction: -1 }
    ].forEach((face, faceIndex) => {
      const span = width - profile.frameThickness * 2.6;
      const step = span / profile.frontBoards;
      for (let index = 0; index < profile.frontBoards; index += 1) {
        if (face.name === 'front' && index === frontGapIndex) {
          continue;
        }

        const boardWidth = step * (0.78 + this._noise(faceIndex, index + box.x, 223) * 0.32);
        let boardHeight = height * (0.7 + this._noise(faceIndex, index + box.y, 227) * 0.22);
        let boardY = (this._noise(faceIndex, index + box.x + box.y, 229) - 0.5) * height * 0.08;
        if (face.name === 'front' && index === ((frontGapIndex + 1) % profile.frontBoards) && profile.gapFront) {
          boardHeight *= 0.7;
          boardY -= height * 0.14;
        }

        const board = new THREE.Mesh(
          this._createShapedPlankGeometry(
            boardWidth,
            boardHeight,
            profile.panelDepth,
            {
              topInsetLeft: boardWidth * 0.07 * this._noise(index, box.x, 233),
              topInsetRight: boardWidth * 0.08 * this._noise(index, box.y, 239),
              bottomInsetLeft: boardWidth * 0.04 * this._noise(index, box.x + box.y, 241),
              bottomInsetRight: boardWidth * 0.05 * this._noise(index, box.y - box.x, 251),
              topLiftLeft: boardHeight * 0.08 * this._noise(index, faceIndex, 257),
              topLiftRight: boardHeight * 0.1 * this._noise(index, face.direction, 263),
              bottomDropLeft: boardHeight * 0.03 * this._noise(faceIndex, index, 269),
              bottomDropRight: boardHeight * 0.04 * this._noise(faceIndex, box.x + index, 271),
              sideShear: profile.panelDepth * (this._noise(index, face.direction, 277) - 0.5) * 0.45
            }
          ),
          materials.wood
        );
        board.position.set(
          -span * 0.5 + step * (index + 0.5) + (this._noise(index, faceIndex, 281) - 0.5) * 0.08,
          boardY,
          face.direction * (halfD - profile.panelDepth * 0.32 + (this._noise(faceIndex, index, 283) - 0.5) * 0.06)
        );
        board.rotation.z = (this._noise(index, face.direction, 293) - 0.5) * profile.lean;
        board.rotation.y = face.direction * (this._noise(faceIndex, index + box.x, 307) - 0.5) * profile.lean * 0.8;
        board.castShadow = true;
        board.receiveShadow = true;
        group.add(board);
      }
    });

    [-1, 1].forEach((direction, sideIndex) => {
      const span = height - profile.frameThickness * 2.4;
      const step = span / profile.sideBoards;
      for (let index = 0; index < profile.sideBoards; index += 1) {
        if (index === sideGapIndex && box.type !== 'safe' && box.type !== 'anchor') {
          continue;
        }

        const boardHeight = step * (0.7 + this._noise(direction, index + box.y, 313) * 0.28);
        let boardWidth = depth * (0.62 + this._noise(direction, index + box.x, 317) * 0.16);
        let boardY = -span * 0.5 + step * (index + 0.5) + (this._noise(index, direction, 331) - 0.5) * 0.05;
        if (index === sideGapIndex && profile.gapSide) {
          boardWidth *= 0.58;
          boardY += step * 0.2;
        }

        const board = new THREE.Mesh(
          this._createShapedPlankGeometry(
            boardWidth,
            boardHeight,
            profile.panelDepth,
            {
              topInsetLeft: boardWidth * 0.06 * this._noise(index, sideIndex, 337),
              topInsetRight: boardWidth * 0.05 * this._noise(index, box.y, 347),
              bottomInsetLeft: boardWidth * 0.04 * this._noise(index, direction, 349),
              bottomInsetRight: boardWidth * 0.03 * this._noise(box.x, index, 353),
              topLiftLeft: boardHeight * 0.05 * this._noise(direction, index, 359),
              topLiftRight: boardHeight * 0.07 * this._noise(sideIndex, box.x, 367),
              sideShear: profile.panelDepth * (this._noise(index, sideIndex, 373) - 0.5) * 0.4
            }
          ),
          materials.wood
        );
        board.position.set(
          direction * (halfW - profile.panelDepth * 0.32 + (this._noise(index, sideIndex, 379) - 0.5) * 0.05),
          boardY,
          (this._noise(index, box.x + box.y, 383) - 0.5) * depth * 0.08
        );
        board.rotation.y = Math.PI / 2 + direction * (this._noise(index, direction, 389) - 0.5) * profile.lean * 0.8;
        board.rotation.z = direction * (this._noise(index, sideIndex, 397) - 0.5) * profile.lean * 0.55;
        board.castShadow = true;
        board.receiveShadow = true;
        group.add(board);
      }
    });

    const lidSpan = depth - profile.frameThickness * 1.8;
    const lidStep = lidSpan / profile.lidBoards;
    for (let index = 0; index < profile.lidBoards; index += 1) {
      const lifted = index === profile.lidBreakIndex;
      const lid = new THREE.Mesh(
        this._createShapedPlankGeometry(
          width * (0.82 + this._noise(index, box.x, 401) * 0.14),
          0.14 + this._noise(index, box.y, 409) * 0.08,
          lidStep * (0.78 + this._noise(index, box.x + box.y, 419) * 0.22),
          {
            topInsetLeft: width * 0.02 * this._noise(index, box.x, 421),
            topInsetRight: width * 0.03 * this._noise(index, box.y, 431),
            topLiftLeft: lifted ? profile.lidLift * 0.32 : profile.lidLift * 0.08,
            topLiftRight: lifted ? profile.lidLift * 0.2 : profile.lidLift * 0.06,
            sideShear: lidStep * (this._noise(index, box.y, 433) - 0.5) * 0.18
          }
        ),
        index === profile.lidBreakIndex ? materials.trim : materials.wood
      );
      lid.position.set(
        (this._noise(index, box.x, 439) - 0.5) * 0.12,
        halfH - 0.04 + (lifted ? profile.lidLift : this._noise(index, box.y, 443) * 0.04),
        -lidSpan * 0.5 + lidStep * (index + 0.5) + (this._noise(index, box.x + box.y, 449) - 0.5) * 0.08
      );
      lid.rotation.x = lifted
        ? -0.16 - this._noise(index, box.x, 457) * 0.18
        : (this._noise(index, box.y, 461) - 0.5) * 0.08;
      lid.rotation.z = (this._noise(index, box.x, 463) - 0.5) * (lifted ? 0.34 : 0.16);
      lid.rotation.y = (this._noise(index, box.y, 467) - 0.5) * 0.1;
      lid.castShadow = true;
      lid.receiveShadow = true;
      group.add(lid);
    }

    for (let index = 0; index < profile.bandCount; index += 1) {
      const y = -height * 0.24 + (profile.bandCount === 1 ? 0 : (index / (profile.bandCount - 1)) * height * 0.5) + (this._noise(index, box.x + box.y, 479) - 0.5) * 0.04;
      [
        new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, 0.12, 0.1), materials.metal),
        new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, 0.12, 0.1), materials.metal),
        new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, depth + 0.14), materials.metal),
        new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, depth + 0.14), materials.metal)
      ].forEach((band, bandIndex) => {
        band.position.set(
          bandIndex < 2 ? 0 : (bandIndex === 2 ? -halfW - 0.01 : halfW + 0.01),
          y,
          bandIndex === 0 ? halfD + 0.02 : bandIndex === 1 ? -halfD - 0.02 : 0
        );
        band.rotation.z = (this._noise(index, bandIndex + box.x, 487) - 0.5) * profile.lean * 0.35;
        band.castShadow = true;
        band.receiveShadow = true;
        group.add(band);
      });
    }

    if (profile.faceCross) {
      [-1, 1].forEach((direction) => {
        const diagA = new THREE.Mesh(
          this._createShapedPlankGeometry(width * 0.78, 0.1, 0.09, { sideShear: 0.015 }),
          materials.trim
        );
        diagA.position.set(0, 0.1, direction * (halfD + 0.04));
        diagA.rotation.z = 0.56;
        diagA.castShadow = true;
        group.add(diagA);

        const diagB = diagA.clone();
        diagB.rotation.z = -0.56;
        group.add(diagB);
      });
    }

    if (profile.hangingBoard) {
      const hanging = new THREE.Mesh(
        this._createShapedPlankGeometry(width * 0.34, 0.12, profile.panelDepth, {
          topInsetLeft: width * 0.02,
          topInsetRight: width * 0.05,
          topLiftLeft: 0.05
        }),
        materials.trim
      );
      hanging.position.set(-width * 0.08, -height * 0.08, halfD + 0.03);
      hanging.rotation.x = 0.92;
      hanging.rotation.z = -0.18;
      hanging.castShadow = true;
      group.add(hanging);
    }

    if (profile.cageBars) {
      [-1, 1].forEach((xDirection) => {
        [-1, 1].forEach((zDirection, index) => {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, height * 0.92, 0.08), materials.metal);
          bar.position.set(xDirection * (halfW - 0.28), 0, zDirection * (halfD - 0.28));
          bar.rotation.z = (this._noise(index, xDirection + zDirection, 491) - 0.5) * 0.06;
          bar.castShadow = true;
          group.add(bar);
        });
      });
    }

    if (profile.chain) {
      for (let index = 0; index < 5; index += 1) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 5, 10), materials.metal);
        link.position.set(0, halfH + 0.18 + index * 0.22, 0);
        link.rotation.x = Math.PI / 2;
        link.rotation.z = index % 2 === 0 ? 0 : Math.PI / 2;
        link.castShadow = true;
        group.add(link);
      }
    }

    if (profile.safePlate) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(width * 0.42, height * 0.44, 0.12), materials.metal);
      plate.position.set(0, 0.04, halfD + 0.07);
      plate.castShadow = true;
      plate.receiveShadow = true;
      group.add(plate);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 8), materials.metal);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(0, 0.04, halfD + 0.15);
      hub.castShadow = true;
      group.add(hub);

      [-1, 1].forEach((direction) => {
        const latch = new THREE.Mesh(new THREE.BoxGeometry(width * 0.18, 0.05, 0.05), materials.metal);
        latch.position.set(direction * width * 0.12, 0.04, halfD + 0.17);
        latch.castShadow = true;
        group.add(latch);
      });
    }

    for (let index = 0; index < profile.splinterCount; index += 1) {
      const splinter = new THREE.Mesh(
        new THREE.ConeGeometry(0.05 + this._noise(index, box.x, 503) * 0.05, 0.28 + this._noise(index, box.y, 509) * 0.36, 5),
        box.type === 'anchor' ? materials.metal : materials.trim
      );
      splinter.position.set(
        (this._noise(index, box.x, 521) - 0.5) * width * 0.7,
        (this._noise(index, box.y, 523) - 0.2) * height * 0.55,
        (this._noise(index, box.x + box.y, 541) > 0.5 ? 1 : -1) * (halfD + 0.08)
      );
      splinter.rotation.x = 0.4 + this._noise(index, box.x, 547) * 1.2;
      splinter.rotation.y = this._noise(index, box.y, 557) * Math.PI * 2;
      splinter.castShadow = true;
      group.add(splinter);
    }

    const mossCount = this._noise(box.x, box.y, 571) > 0.48 ? 1 + Math.floor(this._noise(box.x, box.y, 573) * 2) : 0;
    for (let index = 0; index < mossCount; index += 1) {
      const face = Math.floor(this._noise(index, box.x + box.y, 577) * 4);
      const mossWidth = 0.4 + this._noise(index, box.x, 579) * 0.6;
      const mossHeight = 0.3 + this._noise(index, box.y, 583) * 0.5;
      const moss = new THREE.Mesh(new THREE.PlaneGeometry(mossWidth, mossHeight), this.mossMaterial.clone());
      if (face === 0) {
        moss.position.set(
          (this._noise(index, box.x, 587) - 0.5) * width * 0.5,
          (this._noise(index, box.y, 589) - 0.3) * height * 0.4,
          halfD + 0.02
        );
      } else if (face === 1) {
        moss.position.set(
          (this._noise(index, box.x, 591) - 0.5) * width * 0.5,
          (this._noise(index, box.y, 593) - 0.3) * height * 0.4,
          -halfD - 0.02
        );
        moss.rotation.y = Math.PI;
      } else if (face === 2) {
        moss.position.set(
          halfW + 0.02,
          (this._noise(index, box.y, 597) - 0.3) * height * 0.4,
          (this._noise(index, box.x, 599) - 0.5) * depth * 0.5
        );
        moss.rotation.y = Math.PI / 2;
      } else {
        moss.position.set(
          -halfW - 0.02,
          (this._noise(index, box.y, 601) - 0.3) * height * 0.4,
          (this._noise(index, box.x, 603) - 0.5) * depth * 0.5
        );
        moss.rotation.y = -Math.PI / 2;
      }
      moss.rotation.z = (this._noise(index, box.x, 607) - 0.5) * 0.25;
      moss.receiveShadow = true;
      group.add(moss);
    }

    if (this._noise(box.x, box.y, 611) > 0.55) {
      const brokenCornerGeometry = new THREE.BoxGeometry(0.28, 0.22, 0.24, 2, 1, 2);
      this._warpBoxGeometry(brokenCornerGeometry, 0.05, 613 + box.x * 5 + box.y * 7);
      const brokenCorner = new THREE.Mesh(brokenCornerGeometry, materials.wood);
      const cornerSign = this._noise(box.x, box.y, 617) > 0.5 ? 1 : -1;
      brokenCorner.position.set(
        cornerSign * (halfW - 0.1),
        halfH - 0.08 + this._noise(box.x, box.y, 619) * 0.12,
        (this._noise(box.x, box.y, 621) > 0.5 ? 1 : -1) * (halfD - 0.1)
      );
      brokenCorner.rotation.y = this._noise(box.x, box.y, 623) * Math.PI * 2;
      brokenCorner.rotation.z = (this._noise(box.x, box.y, 627) - 0.5) * 0.5;
      brokenCorner.castShadow = true;
      group.add(brokenCorner);
    }

    return emissiveMaterials;
  }

  _buildDebris() {
    this.floorData.activeTiles.forEach((tile) => {
      const world = this.cellToWorld(tile.x, tile.y);
      const debris = new THREE.Mesh(new THREE.BoxGeometry(this.cellSize * 0.88, 0.56, this.cellSize * 0.88), this.debrisMaterial.clone());
      debris.position.set(world.x, 0.29, world.z);
      debris.visible = false;
      debris.userData.debrisKey = tileKey(tile.x, tile.y);
      debris.userData.debrisX = tile.x;
      debris.userData.debrisY = tile.y;
      debris.castShadow = true;
      debris.receiveShadow = true;
      this.root.add(debris);
      this.debrisNodes[tileKey(tile.x, tile.y)] = debris;
    });
  }

  _registerMonsterMaterial(material, pulseScale = 1) {
    this.monsterPulseMaterials.push({ material, pulseScale });
    return material;
  }

  _warpBoxGeometry(geometry, strength, seed = 0) {
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const nx = (this._noise(index, seed, 701) - 0.5) * strength;
      const ny = (this._noise(index, seed, 709) - 0.5) * strength * 0.62;
      const nz = (this._noise(index, seed, 719) - 0.5) * strength;
      positions.setXYZ(index, x + nx, y + ny, z + nz);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  _warpOrganicGeometry(geometry, strength, seed = 0) {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const spanY = Math.max(
      Math.abs(bounds.max.y),
      Math.abs(bounds.min.y),
      0.001
    );
    const positions = geometry.attributes.position;

    for (let index = 0; index < positions.count; index += 1) {
      let x = positions.getX(index);
      let y = positions.getY(index);
      let z = positions.getZ(index);

      const radial = Math.hypot(x, z);
      // Preserve the original radial direction so vertices near the center cannot spike outward.
      const radialDirX = radial > 0.0001 ? x / radial : 0;
      const radialDirZ = radial > 0.0001 ? z / radial : 0;
      const radialNoise = (this._noise(index, seed, 571) - 0.5) * strength;
      const axialNoise = (this._noise(index, seed, 577) - 0.5) * strength * 0.42;
      const twist = (this._noise(index, seed, 587) - 0.5) * strength * 0.36;
      const asymmetry = (this._noise(index, seed, 593) - 0.5) * strength * 0.3;
      const yRatio = y / spanY;

      x += radialDirX * radialNoise + asymmetry * (0.35 + Math.abs(yRatio) * 0.4);
      z += radialDirZ * radialNoise - twist * yRatio;
      y += axialNoise + twist * radialDirX * 0.35;

      positions.setXYZ(index, x, y, z);
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  _createMonsterTorsoGeometry(seed = 0) {
    const profile = [
      new THREE.Vector2(0.18, -1.06),
      new THREE.Vector2(0.56, -0.92),
      new THREE.Vector2(0.84, -0.26),
      new THREE.Vector2(0.92, 0.18),
      new THREE.Vector2(0.72, 0.82),
      new THREE.Vector2(0.36, 1.26),
      new THREE.Vector2(0.14, 1.48)
    ];
    return this._warpOrganicGeometry(new THREE.LatheGeometry(profile, 18), 0.14, seed);
  }

  _createMonsterHeadGeometry(seed = 0) {
    const profile = [
      new THREE.Vector2(0.08, -0.72),
      new THREE.Vector2(0.32, -0.64),
      new THREE.Vector2(0.54, -0.16),
      new THREE.Vector2(0.5, 0.18),
      new THREE.Vector2(0.34, 0.56),
      new THREE.Vector2(0.18, 0.82),
      new THREE.Vector2(0.06, 0.98)
    ];
    return this._warpOrganicGeometry(new THREE.LatheGeometry(profile, 16), 0.1, seed);
  }

  _createMonsterJawGeometry(seed = 0) {
    const profile = [
      new THREE.Vector2(0.08, -0.34),
      new THREE.Vector2(0.28, -0.28),
      new THREE.Vector2(0.42, -0.08),
      new THREE.Vector2(0.46, 0.14),
      new THREE.Vector2(0.26, 0.26),
      new THREE.Vector2(0.08, 0.3)
    ];
    return this._warpOrganicGeometry(new THREE.LatheGeometry(profile, 14), 0.08, seed);
  }

  _createMonsterArm(side, materials, seed = 0) {
    const arm = new THREE.Group();

    const shoulder = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.SphereGeometry(0.28, 12, 10), 0.08, seed + 1),
      materials.flesh
    );
    shoulder.position.set(side * 0.08, 0.04, 0.06);

    const upper = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.CylinderGeometry(0.16, 0.24, 1.04, 10), 0.08, seed + 3),
      materials.fleshDark
    );
    upper.position.set(side * 0.26, -0.36, 0.18);
    upper.rotation.z = side * 0.78;
    upper.rotation.x = 0.42;

    const elbow = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.SphereGeometry(0.18, 10, 10), 0.06, seed + 5),
      materials.wet
    );
    elbow.position.set(side * 0.58, -0.68, 0.54);

    const fore = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.CylinderGeometry(0.1, 0.16, 1.28, 10), 0.1, seed + 7),
      materials.wet
    );
    fore.position.set(side * 0.88, -1.06, 0.82);
    fore.rotation.z = side * 0.46;
    fore.rotation.x = -0.08;

    const palm = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.SphereGeometry(0.22, 10, 10), 0.08, seed + 9),
      materials.wet
    );
    palm.position.set(side * 1.08, -1.58, 1.02);
    palm.scale.set(1.2, 0.58, 1.45);

    for (let index = 0; index < 4; index += 1) {
      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(0.05 + index * 0.01, 0.42 + index * 0.06, 5),
        materials.claw
      );
      claw.position.set(
        side * (0.95 + index * 0.07),
        -1.74 - index * 0.03,
        1.16 + index * 0.09
      );
      claw.rotation.x = 1.08 + index * 0.1;
      claw.rotation.z = side * (0.24 + index * 0.1);
      arm.add(claw);
    }

    arm.add(shoulder, upper, elbow, fore, palm);
    arm.position.x = side * 0.74;
    arm.position.y = 0.48;
    arm.position.z = 0.1;
    return arm;
  }

  _createMonsterLeg(side, materials, seed = 0) {
    const leg = new THREE.Group();

    const thigh = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.CylinderGeometry(0.18, 0.26, 0.96, 10), 0.08, seed + 1),
      materials.fleshDark
    );
    thigh.position.set(side * 0.14, -0.42, 0.18);
    thigh.rotation.z = side * 0.18;
    thigh.rotation.x = -0.28;

    const knee = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.SphereGeometry(0.16, 10, 10), 0.05, seed + 3),
      materials.wet
    );
    knee.position.set(side * 0.18, -0.84, 0.32);

    const shin = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.CylinderGeometry(0.1, 0.16, 1.08, 10), 0.08, seed + 5),
      materials.bone
    );
    shin.position.set(side * 0.22, -1.28, 0.44);
    shin.rotation.x = 0.54;
    shin.rotation.z = side * 0.08;

    const foot = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.BoxGeometry(0.24, 0.14, 0.72), 0.05, seed + 7),
      materials.claw
    );
    foot.position.set(side * 0.24, -1.82, 0.94);
    foot.rotation.x = -0.18;
    foot.rotation.y = side * 0.06;

    for (let index = 0; index < 3; index += 1) {
      const toe = new THREE.Mesh(
        new THREE.ConeGeometry(0.04 + index * 0.006, 0.28 + index * 0.04, 5),
        materials.claw
      );
      toe.position.set(
        side * (0.18 + index * 0.05),
        -1.86,
        1.18 + index * 0.12
      );
      toe.rotation.x = 1.18;
      toe.rotation.z = side * (0.08 + index * 0.08);
      leg.add(toe);
    }

    leg.add(thigh, knee, shin, foot);
    leg.position.x = side * 0.34;
    leg.position.y = -0.52;
    leg.position.z = 0;
    return leg;
  }

  _createMonsterTendril(seed, material) {
    const tendril = new THREE.Group();
    const curl = (this._noise(seed, 0, 619) - 0.5) * 0.4;
    const flare = (this._noise(seed, 0, 623) - 0.5) * 0.3;
    let offsetX = 0;
    let offsetY = 0;
    let offsetZ = 0;

    for (let index = 0; index < 3; index += 1) {
      const segment = new THREE.Mesh(
        this._warpOrganicGeometry(
          new THREE.CylinderGeometry(0.07 - index * 0.014, 0.1 - index * 0.016, 0.3 - index * 0.04, 9),
          0.05,
          seed + index * 11
        ),
        material
      );
      const bend = 0.6 + index * 0.4;
      segment.position.set(offsetX, offsetY - 0.12, offsetZ + 0.08);
      segment.rotation.x = bend;
      segment.rotation.z = flare + (this._noise(seed, index, 601) - 0.5) * 0.4;
      tendril.add(segment);
      offsetX += Math.sin(bend) * curl * 0.22;
      offsetY -= 0.08 + index * 0.02;
      offsetZ += 0.18;
    }

    tendril.userData.baseRotationX = 0.18 + (this._noise(seed, 0, 607) - 0.5) * 0.2;
    tendril.userData.baseRotationZ = (this._noise(seed, 0, 613) - 0.5) * 0.3;
    tendril.rotation.x = tendril.userData.baseRotationX;
    tendril.rotation.z = tendril.userData.baseRotationZ;
    return tendril;
  }

  _buildMonster() {
    this.monsterGroup = new THREE.Group();
    this.monsterPulseMaterials = [];
    this.monsterEyeNodes = [];
    this.monsterTendrilNodes = [];
    this.monsterJawPivot = null;

    const materials = {
      flesh: this._registerMonsterMaterial(this.monsterMaterial.clone(), 0.92),
      fleshDark: this._registerMonsterMaterial(this.monsterMaterial.clone(), 0.72),
      wet: this._registerMonsterMaterial(this.monsterWetMaterial.clone(), 1.2),
      under: this._registerMonsterMaterial(this.monsterWetMaterial.clone(), 0.84),
      bone: this._registerMonsterMaterial(this.monsterBoneMaterial.clone(), 0.42),
      claw: this._registerMonsterMaterial(this.monsterClawMaterial.clone(), 0.32),
      eyeHot: this._registerMonsterMaterial(this.monsterEyeMaterial.clone(), 1.55),
      eyeDim: this._registerMonsterMaterial(this.monsterEyeMaterial.clone(), 1.18)
    };

    materials.fleshDark.color.offsetHSL(0, -0.06, -0.08);
    materials.under.color.offsetHSL(0, -0.02, -0.12);
    materials.bone.color.offsetHSL(0.02, -0.08, 0.02);
    materials.eyeDim.color.offsetHSL(-0.04, -0.05, -0.12);
    materials.eyeDim.emissive.offsetHSL(0, 0, -0.15);

    const anchorPlate = new THREE.Mesh(
      this._createMonsterTorsoGeometry(819),
      materials.fleshDark
    );
    anchorPlate.position.set(0, 0.18, -0.18);
    anchorPlate.scale.set(0.54, 0.24, 0.58);
    anchorPlate.rotation.x = 0.24;

    const pelvis = new THREE.Mesh(
      this._createMonsterTorsoGeometry(801),
      materials.flesh
    );
    pelvis.position.set(0, -0.12, 0.02);
    pelvis.scale.set(0.58, 0.42, 0.64);
    pelvis.rotation.x = 0.18;

    const torso = new THREE.Mesh(
      this._createMonsterTorsoGeometry(811),
      materials.wet
    );
    torso.position.set(0, 0.12, 0.18);
    torso.scale.set(0.72, 0.56, 0.82);
    torso.rotation.x = -0.18;

    const shoulderMass = new THREE.Mesh(
      this._createMonsterTorsoGeometry(817),
      materials.fleshDark
    );
    shoulderMass.position.set(0, 0.46, -0.04);
    shoulderMass.scale.set(0.78, 0.34, 0.74);
    shoulderMass.rotation.x = 0.12;

    const ribChest = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.TorusGeometry(0.34, 0.08, 10, 22, Math.PI * 1.18), 0.03, 821),
      materials.bone
    );
    ribChest.position.set(0, 0.04, 0.34);
    ribChest.rotation.x = 0.96;
    ribChest.rotation.z = Math.PI;
    ribChest.scale.set(1.22, 0.8, 1.08);

    const neck = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.CylinderGeometry(0.14, 0.2, 0.46, 12), 0.04, 827),
      materials.fleshDark
    );
    neck.position.set(0, 0.08, 0.56);
    neck.rotation.x = 1.1;

    const head = new THREE.Mesh(
      this._createMonsterHeadGeometry(833),
      materials.fleshDark
    );
    head.position.set(0, 0.02, 0.94);
    head.scale.set(0.72, 0.62, 0.82);
    head.rotation.x = -0.18;

    const skullCap = new THREE.Mesh(
      this._createMonsterHeadGeometry(835),
      materials.flesh
    );
    skullCap.position.set(0, 0.2, 0.86);
    skullCap.scale.set(0.56, 0.34, 0.64);
    skullCap.rotation.x = -0.22;

    const snout = new THREE.Mesh(
      this._createMonsterJawGeometry(837),
      materials.wet
    );
    snout.position.set(0, -0.04, 1.18);
    snout.scale.set(0.72, 0.68, 0.84);
    snout.rotation.x = Math.PI / 2;

    const browRidge = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.TorusGeometry(0.28, 0.08, 8, 18, Math.PI), 0.04, 855),
      materials.bone
    );
    browRidge.position.set(0, 0.2, 1.02);
    browRidge.rotation.z = Math.PI;
    browRidge.scale.set(1.28, 0.7, 0.9);

    const crownSpine = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.ConeGeometry(0.12, 0.56, 7), 0.04, 857),
      materials.bone
    );
    crownSpine.position.set(0, 0.72, 0.66);
    crownSpine.rotation.x = -0.44;

    const mawPivot = new THREE.Group();
    mawPivot.position.set(0, -0.12, 1.18);
    mawPivot.userData.baseRotationX = 0.18;
    mawPivot.rotation.x = mawPivot.userData.baseRotationX;

    const mawShell = new THREE.Mesh(
      this._createMonsterJawGeometry(839),
      materials.fleshDark
    );
    mawShell.rotation.x = Math.PI / 2;
    mawShell.scale.set(1.06, 0.94, 1.08);

    const mawRing = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.TorusGeometry(0.24, 0.08, 10, 20), 0.04, 841),
      materials.wet
    );
    mawRing.rotation.x = Math.PI / 2;
    mawRing.scale.set(1.06, 0.9, 1);

    const mawInner = new THREE.Mesh(
      this._warpOrganicGeometry(new THREE.CylinderGeometry(0.14, 0.24, 0.34, 18, 1, true), 0.03, 847),
      materials.under
    );
    mawInner.rotation.x = Math.PI / 2;
    mawInner.position.z = 0.04;

    for (let index = 0; index < 9; index += 1) {
      const angle = -Math.PI * 0.46 + (index / 8) * Math.PI * 0.92;
      const toothHeight = 0.14 + (index % 2 === 0 ? 0.06 : 0.02);
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(0.028 + (index % 2 === 0 ? 0.008 : 0.004), toothHeight, 5),
        materials.bone
      );
      tooth.position.set(Math.sin(angle) * 0.23, -0.02 + Math.cos(angle) * 0.05, 0.15 + Math.cos(angle) * 0.08);
      tooth.rotation.x = Math.PI * 0.62 + (index % 2 === 0 ? 0 : -0.1);
      tooth.rotation.z = angle * 0.24;
      mawPivot.add(tooth);
    }

    for (let index = 0; index < 5; index += 1) {
      const angle = Math.PI * 0.54 + (index / 4) * Math.PI * 0.92;
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(0.026, 0.1 + (index === 2 ? 0.05 : 0), 5),
        materials.bone
      );
      tooth.position.set(Math.sin(angle) * 0.2, -0.02 + Math.cos(angle) * 0.04, 0.14 + Math.cos(angle) * 0.06);
      tooth.rotation.x = Math.PI * 0.38;
      tooth.rotation.z = angle * 0.26;
      mawPivot.add(tooth);
    }

    [
      { x: -0.24, y: 0.08, z: 1.02, scale: 1.06, material: materials.eyeHot },
      { x: 0.22, y: 0.1, z: 1.01, scale: 0.94, material: materials.eyeHot },
      { x: -0.36, y: -0.08, z: 0.82, scale: 0.76, material: materials.eyeDim },
      { x: 0.34, y: -0.1, z: 0.84, scale: 0.74, material: materials.eyeDim },
      { x: -0.08, y: 0.26, z: 0.94, scale: 0.6, material: materials.eyeDim },
      { x: 0.1, y: 0.28, z: 0.96, scale: 0.58, material: materials.eyeDim },
      { x: 0.02, y: -0.02, z: 1.18, scale: 0.42, material: materials.eyeHot }
    ].forEach((eyeConfig) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), eyeConfig.material);
      eye.position.set(eyeConfig.x, eyeConfig.y, eyeConfig.z);
      eye.scale.setScalar(eyeConfig.scale);
      eye.userData.baseScale = eyeConfig.scale;
      this.monsterEyeNodes.push(eye);
      this.monsterGroup.add(eye);
    });

    const ribSpines = new THREE.Group();
    for (let index = 0; index < 5; index += 1) {
      const side = index - 2;
      const lateral = side * 0.18;
      const spineHeight = 0.24 + (2 - Math.abs(side)) * 0.08;
      const spine = new THREE.Mesh(
        this._warpOrganicGeometry(new THREE.ConeGeometry(0.05, spineHeight, 6), 0.03, 905 + index * 13),
        materials.bone
      );
      spine.position.set(lateral, 0.34 - Math.abs(side) * 0.03, -0.34 - Math.abs(side) * 0.06);
      spine.rotation.x = -0.92 + Math.abs(side) * 0.12;
      spine.rotation.z = side * 0.18;
      ribSpines.add(spine);
    }

    const shoulderHooks = new THREE.Group();
    [-1, 1].forEach((side, index) => {
      const hook = new THREE.Group();

      const upper = new THREE.Mesh(
        this._warpOrganicGeometry(new THREE.CylinderGeometry(0.07, 0.11, 0.34, 10), 0.05, 951 + index * 17),
        materials.wet
      );
      upper.position.set(0, -0.18, 0);
      upper.rotation.z = side * 0.88;
      upper.rotation.x = 0.46;

      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.26, 6),
        materials.claw
      );
      claw.position.set(side * 0.24, -0.32, 0.3);
      claw.rotation.x = -2.32;
      claw.rotation.z = side * 0.42;

      hook.add(upper, claw);
      hook.position.set(side * 0.52, 0.26, -0.08);
      hook.scale.setScalar(0.88);
      shoulderHooks.add(hook);
    });

    [-1, 1].forEach((side, index) => {
      const arm = this._createMonsterArm(side, materials, 1001 + index * 31);
      arm.scale.set(0.56, 0.66, 0.58);
      arm.position.x *= 0.82;
      arm.position.y -= 0.04;
      arm.position.z -= 0.04;
      arm.rotation.z += side * 0.12;
      arm.rotation.x = 0.08;
      this.monsterGroup.add(arm);
    });

    [-1, 1].forEach((side, index) => {
      const leg = this._createMonsterLeg(side, materials, 1101 + index * 29);
      leg.scale.set(0.46, 0.56, 0.48);
      leg.position.x *= 0.94;
      leg.position.y += 0.34;
      leg.position.z -= 0.06;
      leg.rotation.x = 0.08;
      this.monsterGroup.add(leg);
    });

    for (let index = 0; index < 3; index += 1) {
      const tendril = this._createMonsterTendril(871 + index * 17, materials.wet);
      tendril.scale.setScalar(0.3 + index * 0.04);
      const angle = -0.96 + index * 0.96;
      tendril.position.set(Math.sin(angle) * 0.42, 0.2 - index * 0.04, -0.3 + Math.cos(angle) * 0.16);
      this.monsterTendrilNodes.push(tendril);
      this.monsterGroup.add(tendril);
    }

    mawPivot.add(mawShell, mawRing, mawInner);
    this.monsterJawPivot = mawPivot;
    this.monsterGroup.add(
      anchorPlate,
      pelvis,
      torso,
      shoulderMass,
      ribChest,
      neck,
      head,
      skullCap,
      snout,
      browRidge,
      crownSpine,
      ribSpines,
      shoulderHooks,
      mawPivot
    );
    this.monsterGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.matrixAutoUpdate = false;
        child.updateMatrix();
      }
    });
    this.root.add(this.monsterGroup);
  }

  _buildQuestionCard() {
    const anchor = new THREE.Group();
    const group = new THREE.Group();
    const panelWidth = this.cellSize * 0.72;
    const panelHeight = this.cellSize * 0.54;
    const outerFrame = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth + 0.24, panelHeight + 0.18, 0.06),
      this.wallTrimMaterial.clone()
    );
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth + 0.1, panelHeight + 0.08, 0.04),
      this.floorEdgeMaterial.clone()
    );
    plate.material.color.offsetHSL(0.02, 0.04, 0.06);
    const innerFrame = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth + 0.14, panelHeight + 0.12, 0.028),
      this.floorInsetMaterial.clone()
    );
    innerFrame.material.emissive = new THREE.Color(0x2a1906);
    innerFrame.material.emissiveIntensity = 0.35;
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(panelWidth + 0.34, panelHeight + 0.26),
      new THREE.MeshBasicMaterial({
        color: 0xe1a35a,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );

    const material = new THREE.MeshStandardMaterial({
      map: this.questionTexture,
      color: 0xf3e3c0,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      alphaTest: 0.02,
      roughness: 0.72,
      metalness: 0.02,
      emissive: 0x1a1105,
      emissiveIntensity: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(panelWidth, panelHeight),
      material
    );
    plate.position.z = 0.012;
    innerFrame.position.z = 0.032;
    glow.position.z = -0.02;
    plane.position.z = 0.05;
    plane.renderOrder = 120;
    [outerFrame, plate, innerFrame].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    group.add(glow, outerFrame, plate, innerFrame, plane);
    group.rotation.x = -Math.PI / 2;
    anchor.add(group);
    anchor.visible = false;
    anchor.userData.panelWidth = panelWidth + 0.34;
    anchor.userData.panelHeight = panelHeight + 0.26;
    anchor.userData.baseScale = 1;
    this.root.add(anchor);
    this.questionPanelGroup = anchor;
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

      const pillarSeed = 951 + Math.floor(anchor.x * 13 + anchor.z * 17);
      const pillarGeometry = new THREE.BoxGeometry(0.92, this.ceilingY + 0.26, 0.82, 2, 6, 2);
      this._warpBoxGeometry(pillarGeometry, 0.08, pillarSeed);
      const pillar = new THREE.Mesh(pillarGeometry, this.columnMaterial.clone());
      pillar.position.set(anchor.x, this.ceilingY * 0.5, anchor.z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.root.add(pillar);

      const baseGeometry = new THREE.BoxGeometry(1.22, 0.5, 1.12, 2, 1, 2);
      this._warpBoxGeometry(baseGeometry, 0.05, pillarSeed + 3);
      const base = new THREE.Mesh(baseGeometry, this.columnMaterial.clone());
      base.position.set(anchor.x, 0.32, anchor.z);
      base.castShadow = true;
      base.receiveShadow = true;
      this.root.add(base);

      const capitalGeometry = new THREE.BoxGeometry(1.28, 0.42, 1.18, 2, 1, 2);
      this._warpBoxGeometry(capitalGeometry, 0.05, pillarSeed + 7);
      const capital = new THREE.Mesh(capitalGeometry, this.wallTrimMaterial.clone());
      capital.position.set(anchor.x, this.ceilingY - 0.22, anchor.z);
      capital.castShadow = true;
      capital.receiveShadow = true;
      this.root.add(capital);

      const corbelGeometry = new THREE.BoxGeometry(0.9, 0.32, 0.8, 2, 1, 2);
      this._warpBoxGeometry(corbelGeometry, 0.04, pillarSeed + 11);
      const corbel = new THREE.Mesh(corbelGeometry, this.wallTrimMaterial.clone());
      corbel.position.set(anchor.x, this.ceilingY - 0.72, anchor.z);
      corbel.castShadow = true;
      corbel.receiveShadow = true;
      this.root.add(corbel);

      if (this._noise(anchor.x, anchor.z, 41) > 0.42) {
        const moss = new THREE.Mesh(
          new THREE.PlaneGeometry(0.7, 1.72),
          this.mossMaterial.clone()
        );
        moss.position.set(
          anchor.x + (this._noise(anchor.x, anchor.z, 45) - 0.5) * 0.12,
          1.28 + this._noise(anchor.x, anchor.z, 43) * 1.4,
          anchor.z + 0.4
        );
        moss.rotation.y = this._noise(anchor.x, anchor.z, 47) * 0.35;
        moss.rotation.z = (this._noise(anchor.x, anchor.z, 49) - 0.5) * 0.3;
        this.root.add(moss);
      }

      if (this._noise(anchor.x, anchor.z, 51) > 0.6) {
        const chunkGeometry = new THREE.BoxGeometry(0.42, 0.26, 0.38, 2, 1, 2);
        this._warpBoxGeometry(chunkGeometry, 0.06, pillarSeed + 19);
        const chunk = new THREE.Mesh(chunkGeometry, this.wallMaterial.clone());
        chunk.position.set(
          anchor.x + (this._noise(anchor.x, anchor.z, 53) - 0.5) * 0.7,
          0.14,
          anchor.z + (this._noise(anchor.x, anchor.z, 55) - 0.5) * 0.6
        );
        chunk.rotation.y = this._noise(anchor.x, anchor.z, 57) * Math.PI * 2;
        chunk.rotation.z = (this._noise(anchor.x, anchor.z, 59) - 0.5) * 0.5;
        chunk.castShadow = true;
        chunk.receiveShadow = true;
        this.root.add(chunk);
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

      const light = new THREE.PointLight(0xf2a14a, 1.6, 22, 1.7);
      light.position.set(anchor.x, anchor.y + 0.36, anchor.z);
      this.root.add(light);
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xffb86a, transparent: true, opacity: 0.22, depthWrite: false })
      );
      halo.position.copy(flame.position);
      halo.scale.set(1.8, 2.2, 1.8);
      torch.add(halo);
      this.wallTorches.push({ light, flame, halo, seed: index * 1.37 });
    });
  }

  _buildMoteField() {
    const count = Math.max(72, this.floorData.activeTiles.length * 7);
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
      color: 0xb29772,
      size: 0.08,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      sizeAttenuation: true
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

  worldToCell(worldX, worldZ) {
    const halfW = this.floorData.config.width * this.cellSize * 0.5;
    const halfH = this.floorData.config.height * this.cellSize * 0.5;
    return {
      x: THREE.MathUtils.clamp(
        Math.round((worldX + halfW - this.cellSize * 0.5) / this.cellSize),
        0,
        this.floorData.config.width - 1
      ),
      y: THREE.MathUtils.clamp(
        Math.round((worldZ + halfH - this.cellSize * 0.5) / this.cellSize),
        0,
        this.floorData.config.height - 1
      )
    };
  }

  _getFloorTopAtCell(x, y) {
    const floorNode = this.floorNodes[tileKey(x, y)];
    return floorNode
      ? floorNode.position.y + ((floorNode.geometry?.parameters?.height || 0.2) * 0.5)
      : 0.08;
  }

  _getFacingYaw(facing) {
    return [0, -Math.PI / 2, Math.PI, Math.PI / 2][facing] || 0;
  }

  setPlayerState(player, instant = false) {
    this.playerState = { ...player };
    const world = this.cellToWorld(player.x, player.y);
    this.playerTarget.set(world.x, this.eyeHeight, world.z);
    this.targetYaw = typeof player.cameraYaw === 'number' ? player.cameraYaw : this._getFacingYaw(player.facing);
    this.targetPitch = this._getViewPitch(player);
    if (instant) {
      this.playerRender.copy(this.playerTarget);
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
    }
  }

  _getViewPitch(player = this.playerState) {
    if (!player) {
      return -0.08;
    }

    const pitchOffset = typeof player.cameraPitch === 'number' ? player.cameraPitch : 0;
    const basePitch = this.snapshot?.question?.active ? -0.68 : player.lookMode === 'up' ? 0.54 : -0.08;
    return Math.max(-1.22, Math.min(1.18, basePitch + pitchOffset));
  }

  _isViewAimedUp(player = this.playerState) {
    return this._getViewPitch(player) >= 0.18;
  }

  setPointerClientPosition(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    this.pointerInsideCanvas = px >= 0 && px <= 1 && py >= 0 && py <= 1;
    this.pointerNdc.set(
      Math.max(-1, Math.min(1, px * 2 - 1)),
      Math.max(-1, Math.min(1, -(py * 2 - 1)))
    );
  }

  clearPointerClientPosition() {
    this.pointerInsideCanvas = false;
  }

  _getRaycastPointer() {
    return this.pointerInsideCanvas ? this.pointerNdc : this.screenCenter;
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

  pickCeilingBox() {
    return this._getCeilingBoxIntersection();
  }

  pickCleanupDebris() {
    return this._getCleanupDebrisIntersection();
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
      const slow = Math.sin(this.clock.elapsedTime * 5.2 + torch.seed);
      const fast = Math.sin(this.clock.elapsedTime * 11.4 + torch.seed * 1.9);
      torch.light.intensity = 1.45 + slow * 0.22 + fast * 0.1;
      const hue = 0.075 + slow * 0.008;
      torch.light.color.setHSL(hue, 0.78, 0.58);
      torch.flame.scale.y = 1.5 + slow * 0.22 + fast * 0.06;
      torch.flame.scale.x = 0.78 + fast * 0.05;
      torch.flame.scale.z = 0.78 + fast * 0.05;
      if (torch.halo) {
        const haloPulse = 0.85 + slow * 0.12 + fast * 0.06;
        torch.halo.scale.setScalar(1.9 * haloPulse);
        torch.halo.material.opacity = 0.18 + slow * 0.05;
      }
    });

    this._updateQuestionHover();
    this._updateTargetHover();
  }

  _applySnapshot() {
    const { floorData, monster, quake, now, player, question } = this.snapshot;

    this.setPlayerState(player);

    const boxList = floorData.boxList;
    for (let index = 0; index < boxList.length; index += 1) {
      const box = boxList[index];
      const node = this.boxNodes[box.key];
      if (!node) {
        continue;
      }

      const isBreaking = box.fallAnimationUntil > now;
      const breakProgress = isBreaking
        ? 1 - ((box.fallAnimationUntil - now) / Math.max(1, box.fallAnimationUntil - box.fallAnimationStartedAt))
        : 0;
      const warningProgress = box.scheduledFallAt > now
        ? 1 - ((box.scheduledFallAt - now) / Math.max(1, box.scheduledFallAt - box.warningStartedAt))
        : 0;
      const sway = warningProgress > 0
        ? Math.sin(this.clock.elapsedTime * (12 + node.swaySeed) + node.swaySeed) * (0.04 + warningProgress * 0.12)
        : 0;

      node.group.visible = !box.fallen || isBreaking;
      if (!node.group.visible) {
        continue;
      }

      node.group.position.set(
        node.group.position.x,
        node.baseY - breakProgress * 7.2 - Math.abs(sway) * 0.22,
        node.group.position.z
      );
      node.group.rotation.x = node.baseRotationX + sway * 0.18 + breakProgress * 1.05;
      node.group.rotation.z = node.baseRotationZ + sway + breakProgress * 1.35 * node.dropDirection;
      node.group.scale.setScalar(1 - breakProgress * 0.18);

      const ratio = box.stability / box.maxStability;
      const applyEmissive = (color, intensity) => {
        node.emissiveMaterials.forEach((material, index) => {
          material.emissive.setHex(color);
          material.emissiveIntensity = intensity * (index === 2 ? 0.82 : 1);
        });
      };

      applyEmissive(0x000000, 0);
      if (box.revealUntil > now) {
        const color = ratio >= 0.55 ? 0x4ea55b : ratio >= 0.28 ? 0xcaa43d : 0xb84334;
        applyEmissive(color, 0.42);
      }
      if (warningProgress > 0) {
        applyEmissive(0x5f2b12, 0.18 + warningProgress * 0.14);
      }
      if (box.fortifiedUntil > now) {
        applyEmissive(0x4a86c5, 0.56);
      }
      if ((this.snapshot?.targeting?.mode === 'vision' || this.snapshot?.targeting?.mode === 'fortify') && this.targetHoverBoxKey === box.key) {
        applyEmissive(this.snapshot.targeting.mode === 'fortify' ? 0x7db2e8 : 0xe8c88a, 0.64);
      }
    }

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
      const debris = this.debrisNodes[key];
      const isVisible = Boolean(floorData.debrisMap[key]);
      debris.visible = isVisible;
      debris.scale.setScalar(key === this.targetHoverDebrisKey ? 1.04 : 1);
      debris.material.emissive.setHex(key === this.targetHoverDebrisKey ? 0xc28d47 : 0x000000);
      debris.material.emissiveIntensity = key === this.targetHoverDebrisKey ? 0.34 : 0;
    });

    const monsterWorld = this.cellToWorld(monster.x, monster.y);
    let targetY = monster.state === 'stunned' ? 0.72 : 0.78;
    if (monster.state === 'ceiling') {
      const attachedBox = this.boxNodes[tileKey(monster.x, monster.y)];
      targetY = attachedBox
        ? attachedBox.group.position.y - attachedBox.boxHeight * 0.5 - 0.22
        : this.ceilingY - 1.42;
    }
    this.monsterTarget.set(monsterWorld.x, targetY, monsterWorld.z);
    this.monsterGroup.position.lerp(this.monsterTarget, 0.1333333333);
    this.monsterGroup.rotation.x = monster.state === 'ceiling' ? Math.PI : 0;
    this.monsterGroup.rotation.z = monster.state === 'ceiling' ? Math.sin(this.clock.elapsedTime * 2.4) * 0.04 : 0;
    this.monsterGroup.scale.setScalar(
      monster.state === 'stunned'
        ? 0.5
        : monster.state === 'ceiling'
          ? 0.64
          : 0.58
    );

    const pulse = 0.08 + Math.sin(this.clock.elapsedTime * 4.8) * 0.03;
    this.monsterPulseMaterials.forEach((entry, index) => {
      entry.material.emissiveIntensity = 0.02 + pulse * entry.pulseScale + index * 0.004;
    });
    if (this.monsterJawPivot) {
      this.monsterJawPivot.rotation.x = this.monsterJawPivot.userData.baseRotationX + 0.06 + Math.sin(this.clock.elapsedTime * 3.8) * 0.09;
    }
    this.monsterEyeNodes.forEach((eye, index) => {
      const scale = (eye.userData.baseScale || 1) * (1 + Math.sin(this.clock.elapsedTime * (5.2 + index * 0.7)) * 0.06);
      eye.scale.setScalar(scale);
      eye.updateMatrix();
    });
    this.monsterTendrilNodes.forEach((tendril, index) => {
      tendril.rotation.x = tendril.userData.baseRotationX + Math.sin(this.clock.elapsedTime * (2.6 + index * 0.45)) * 0.14;
      tendril.rotation.z = tendril.userData.baseRotationZ + Math.cos(this.clock.elapsedTime * (3 + index * 0.32)) * 0.1;
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
    if (!this.questionPlane || !this.questionPanelGroup || !question?.active || !question.options?.length) {
      if (this.questionPanelGroup) {
        this.questionPanelGroup.visible = false;
      }
      if (this.questionHoverIndex !== -1) {
        this.questionHoverIndex = -1;
        this.questionSignature = '';
      }
      return;
    }

    const world = this.cellToWorld(player.x, player.y);
    const panelYaw = typeof question.panelYaw === 'number' ? question.panelYaw : 0;
    const forwardOffset = this.cellSize * 0.42;
    const hoverLift = Math.sin(this.clock.elapsedTime * 4.2) * 0.004;
    const halfW = this.floorData.config.width * this.cellSize * 0.5;
    const halfH = this.floorData.config.height * this.cellSize * 0.5;
    const edgeDistance = Math.min(
      player.x,
      this.floorData.config.width - 1 - player.x,
      player.y,
      this.floorData.config.height - 1 - player.y
    );
    const edgeFactor = THREE.MathUtils.clamp(edgeDistance / 1.5, 0, 1);
    const panelScale = 0.88 + edgeFactor * 0.34;
    this.questionPanelGroup.scale.setScalar(panelScale);

    const panelWidth = (this.questionPanelGroup.userData.panelWidth || this.cellSize * 0.9) * panelScale;
    const panelHeight = (this.questionPanelGroup.userData.panelHeight || this.cellSize * 0.7) * panelScale;
    const clampPadX = Math.max(this.cellSize * 0.38, panelWidth * 0.5 + 0.12);
    const clampPadZ = Math.max(this.cellSize * 0.38, panelHeight * 0.5 + 0.12);
    const rawX = world.x - Math.sin(panelYaw) * forwardOffset;
    const rawZ = world.z - Math.cos(panelYaw) * forwardOffset;
    const clampedX = THREE.MathUtils.clamp(rawX, -halfW + clampPadX, halfW - clampPadX);
    const clampedZ = THREE.MathUtils.clamp(rawZ, -halfH + clampPadZ, halfH - clampPadZ);
    const panelCell = this.worldToCell(clampedX, clampedZ);
    const panelCellKey = tileKey(panelCell.x, panelCell.y);
    const floorTop = this.floorNodes[panelCellKey]
      ? this._getFloorTopAtCell(panelCell.x, panelCell.y)
      : this._getFloorTopAtCell(player.x, player.y);
    this.questionPanelGroup.visible = true;
    this.questionPanelGroup.position.set(
      clampedX,
      floorTop + 0.105 + hoverLift,
      clampedZ
    );
    this.questionPanelGroup.rotation.set(0, panelYaw, 0);

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
    if (!this.snapshot?.question?.active || !this.questionPanelGroup?.visible || this.snapshot.question.selectedIndex !== null) {
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

  _updateTargetHover() {
    const isTargetingBox = this.snapshot?.state === 'target_select'
      && (this.snapshot?.targeting?.mode === 'vision' || this.snapshot?.targeting?.mode === 'fortify')
      && this._isViewAimedUp(this.snapshot?.player);
    const isTargetingCleanup = this.snapshot?.state === 'target_select'
      && this.snapshot?.targeting?.mode === 'cleanup';

    if (isTargetingBox) {
      const picked = this.pickCeilingBox();
      this.targetHoverBoxKey = picked?.key || null;
    } else {
      this.targetHoverBoxKey = null;
    }

    if (isTargetingCleanup) {
      const pickedDebris = this.pickCleanupDebris();
      this.targetHoverDebrisKey = pickedDebris?.key || null;
    } else {
      this.targetHoverDebrisKey = null;
    }
  }

  _getQuestionIntersection() {
    if (!this.questionPlane?.visible || !this.questionPanelGroup?.visible) {
      return null;
    }

    this.raycaster.setFromCamera(this._getRaycastPointer(), this.camera);
    const [intersection] = this.raycaster.intersectObject(this.questionPlane, false);
    return intersection || null;
  }

  _getCeilingBoxIntersection() {
    if (!this.boxNodeList.length || !this.floorData) {
      return null;
    }

    this.raycaster.setFromCamera(this._getRaycastPointer(), this.camera);
    let bestHit = null;
    let bestDistance = Infinity;

    for (let index = 0; index < this.boxNodeList.length; index += 1) {
      const node = this.boxNodeList[index];
      const box = this.floorData.boxes[node.boxKey];
      if (!box || box.fallen || !node.group.visible) {
        continue;
      }

      const scale = node.group.scale.x || 1;
      const halfX = node.targetHalfSize.x * scale;
      const halfY = node.targetHalfSize.y * scale;
      const halfZ = node.targetHalfSize.z * scale;
      this.targetBoxBounds.min.set(
        node.group.position.x - halfX,
        node.group.position.y - halfY,
        node.group.position.z - halfZ
      );
      this.targetBoxBounds.max.set(
        node.group.position.x + halfX,
        node.group.position.y + halfY,
        node.group.position.z + halfZ
      );

      if (!this.raycaster.ray.intersectBox(this.targetBoxBounds, this.targetBoxHit)) {
        continue;
      }

      const distance = this.raycaster.ray.origin.distanceToSquared(this.targetBoxHit);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestHit = { key: node.boxKey, x: node.boxX, y: node.boxY };
      }
    }

    return bestHit;
  }

  _getCleanupDebrisIntersection() {
    if (!this.floorData) {
      return null;
    }

    const allowedCleanupKeys = this.snapshot?.targeting?.cleanupKeys || null;
    const targets = Object.values(this.debrisNodes).filter((debris) => {
      if (!debris.visible) {
        return false;
      }
      if (!allowedCleanupKeys) {
        return true;
      }
      return allowedCleanupKeys.includes(debris.userData.debrisKey);
    });

    if (!targets.length) {
      return null;
    }

    this.raycaster.setFromCamera(this._getRaycastPointer(), this.camera);
    const [hit] = this.raycaster.intersectObjects(targets, false);
    if (!hit?.object?.userData?.debrisKey) {
      return null;
    }

    return {
      key: hit.object.userData.debrisKey,
      x: hit.object.userData.debrisX,
      y: hit.object.userData.debrisY
    };
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
    const padding = 92;
    const innerWidth = width - padding * 2;
    const optionGap = 22;
    const optionHeight = 126;
    const optionWidth = innerWidth;
    const optionTop = height - padding - optionHeight * 4 - optionGap * 3 - 78;
    const selectedIndex = question.selectedIndex;
    const feedback = question.feedback;

    ctx.clearRect(0, 0, width, height);

    const recess = ctx.createLinearGradient(0, 0, 0, height);
    recess.addColorStop(0, 'rgba(12, 10, 8, 0.14)');
    recess.addColorStop(0.5, 'rgba(42, 31, 22, 0.24)');
    recess.addColorStop(1, 'rgba(8, 6, 5, 0.2)');
    ctx.fillStyle = recess;
    this._drawRoundedRect(ctx, 34, 34, width - 68, height - 68, 52);
    ctx.fill();

    ctx.strokeStyle = 'rgba(188, 151, 100, 0.2)';
    ctx.lineWidth = 4;
    this._drawRoundedRect(ctx, 34, 34, width - 68, height - 68, 52);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(248, 221, 169, 0.08)';
    ctx.lineWidth = 2;
    this._drawRoundedRect(ctx, 54, 54, width - 108, height - 108, 40);
    ctx.stroke();

    [
      { x: width * 0.28, y: height * 0.22, r: 220, color: 'rgba(14, 11, 9, 0.14)' },
      { x: width * 0.72, y: height * 0.72, r: 250, color: 'rgba(156, 110, 58, 0.08)' }
    ].forEach((stain) => {
      const gradient = ctx.createRadialGradient(stain.x, stain.y, 0, stain.x, stain.y, stain.r);
      gradient.addColorStop(0, stain.color);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    });

    ctx.strokeStyle = 'rgba(205, 170, 116, 0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(padding, 204);
    ctx.lineTo(width - padding, 204);
    ctx.moveTo(padding, optionTop - 34);
    ctx.lineTo(width - padding, optionTop - 34);
    ctx.stroke();

    ctx.fillStyle = 'rgba(222, 193, 138, 0.92)';
    ctx.font = '700 66px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(question.topic || 'Topic', width / 2, 128);

    ctx.fillStyle = 'rgba(230, 216, 185, 0.58)';
    ctx.font = '600 34px Georgia, serif';
    ctx.fillText(question.level || '', width / 2, 184);

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(244, 235, 212, 0.94)';
    ctx.font = '600 52px Georgia, serif';
    let cursorY = 264;
    cursorY = this._drawWrappedText(ctx, question.text || '', padding, cursorY, innerWidth, 64, 3);

    ctx.fillStyle = 'rgba(235, 194, 124, 0.95)';
    ctx.font = '700 58px Georgia, serif';
    cursorY += 28;
    this._drawWrappedText(ctx, question.display || '', padding, cursorY, innerWidth, 66, 2);

    this.questionOptionRects = [];
    ctx.font = '600 38px Georgia, serif';

    question.options.forEach((option, index) => {
      const x = padding;
      const y = optionTop + index * (optionHeight + optionGap);
      const hovered = selectedIndex === null && this.questionHoverIndex === index;
      const isCorrect = selectedIndex !== null && index === question.correctIndex;
      const isWrong = selectedIndex !== null && index === selectedIndex && selectedIndex !== question.correctIndex;

      const fill = isCorrect
        ? 'rgba(56, 97, 52, 0.52)'
        : isWrong
          ? 'rgba(104, 43, 35, 0.56)'
          : hovered
            ? 'rgba(118, 82, 33, 0.46)'
            : 'rgba(10, 8, 7, 0.16)';
      const stroke = isCorrect
        ? 'rgba(169, 220, 158, 0.84)'
        : isWrong
          ? 'rgba(220, 148, 137, 0.8)'
          : hovered
            ? 'rgba(232, 198, 128, 0.78)'
            : 'rgba(194, 163, 104, 0.24)';

      ctx.fillStyle = fill;
      this._drawRoundedRect(ctx, x, y, optionWidth, optionHeight, 20);
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = hovered ? 5 : 3;
      this._drawRoundedRect(ctx, x, y, optionWidth, optionHeight, 20);
      ctx.stroke();

      ctx.fillStyle = 'rgba(247, 239, 222, 0.95)';
      ctx.font = '700 34px Georgia, serif';
      ctx.fillText(`${index + 1}.`, x + 30, y + 48);
      ctx.font = '600 38px Georgia, serif';
      this._drawWrappedText(ctx, option || '', x + 90, y + 44, optionWidth - 124, 42, 2);

      this.questionOptionRects.push({ x, y, width: optionWidth, height: optionHeight });
    });

    if (feedback?.text) {
      const feedbackY = height - padding - 16;
      ctx.fillStyle = feedback.isCorrect ? 'rgba(203, 226, 186, 0.9)' : 'rgba(239, 183, 168, 0.92)';
      ctx.font = '700 32px Georgia, serif';
      ctx.textAlign = 'center';
      this._drawWrappedText(ctx, feedback.text, width / 2 - innerWidth / 2, feedbackY, innerWidth, 38, 2, 'center');
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
