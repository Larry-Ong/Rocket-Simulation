/**
 * Rendering and Particle System for Model Rocket Simulation
 */

class RocketSimulation {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    this.particles = [];
    this.clouds = [];
    this.stars = [];
    
    // Camera and scaling
    this.camY = 0;
    this.worldScale = 8; // Pixels per meter for environment scrolling
    
    // Wind factor for clouds/smoke
    this.wind = 15; // px/sec drift
    
    // Sound System using Web Audio API
    this.audioCtx = null;
    this.engineNoise = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.soundEnabled = true;

    // Initialize environment
    this.initClouds();
    this.initStars();
    
    // Handle resizing
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
    if (!enabled) {
      this.stopSound();
    }
  }

  // --- Sound Synthesis ---
  initAudio() {
    if (this.audioCtx) return;
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  startSound() {
    if (!this.soundEnabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    // Create White Noise buffer
    const bufferSize = 2 * this.audioCtx.sampleRate;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    // Noise Source
    this.engineNoise = this.audioCtx.createBufferSource();
    this.engineNoise.buffer = noiseBuffer;
    this.engineNoise.loop = true;

    // Biquad Filter for rumble sound
    this.engineFilter = this.audioCtx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(100, this.audioCtx.currentTime);
    this.engineFilter.Q.setValueAtTime(4.0, this.audioCtx.currentTime);

    // Gain node for volume control
    this.engineGain = this.audioCtx.createGain();
    this.engineGain.gain.setValueAtTime(0.001, this.audioCtx.currentTime);

    // Connect
    this.engineNoise.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.audioCtx.destination);

    this.engineNoise.start();
    // Fade in
    this.engineGain.gain.linearRampToValueAtTime(0.8, this.audioCtx.currentTime + 0.1);
  }

  updateSound(thrust, altitude, velocity) {
    if (!this.soundEnabled || !this.audioCtx || !this.engineGain) return;

    // Filter frequency scales up with thrust (more thrust = higher pitch hiss combined with rumble)
    const freq = 60 + (thrust * 15) + (Math.random() * 30);
    this.engineFilter.frequency.setValueAtTime(Math.min(freq, 800), this.audioCtx.currentTime);

    // Volume drops off as the rocket goes higher (simulating distance from launcher)
    // and fades out if thrust drops to 0
    let targetVolume = 0;
    if (thrust > 0) {
      const distanceFactor = Math.max(0.05, 1 - (altitude / 800));
      targetVolume = 0.5 * distanceFactor * (0.4 + 0.6 * (thrust / 30));
    }
    this.engineGain.gain.setTargetAtTime(targetVolume, this.audioCtx.currentTime, 0.05);
  }

  stopSound() {
    if (this.engineNoise) {
      try {
        this.engineNoise.stop();
        this.engineNoise.disconnect();
      } catch(e) {}
      this.engineNoise = null;
    }
  }

  playEjectionSound() {
    if (!this.soundEnabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    // Quick burst of high-passed noise for parachute pop
    const bufferSize = 0.15 * this.audioCtx.sampleRate;
    const popBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = popBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const popSource = this.audioCtx.createBufferSource();
    popSource.buffer = popBuffer;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(0.8, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.15);

    popSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioCtx.destination);
    popSource.start();
  }

  playLandingSound() {
    if (!this.soundEnabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    // Low rumble thud
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, this.audioCtx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.6, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.26);
  }

  // --- Particle Systems ---
  spawnExhaust(x, y, thrust, phase, velocity) {
    if (phase !== 'thrust' || thrust <= 0) return;

    const count = Math.ceil(thrust / 4) + 1;
    for (let i = 0; i < count; i++) {
      // Fire particle
      this.particles.push({
        x: x + (Math.random() * 6 - 3),
        y: y + 2,
        vx: (Math.random() * 4 - 2),
        vy: (Math.random() * 8 + 6 + velocity * 0.1), // push down relative to rocket speed
        size: Math.random() * 6 + 4,
        color: `rgba(${255}, ${100 + Math.random() * 100}, ${0}, ${0.8})`,
        life: 1.0,
        decay: 0.08 + Math.random() * 0.05,
        type: 'fire'
      });
    }

    // Smoke particle (occasionally)
    if (Math.random() < 0.8) {
      this.particles.push({
        x: x + (Math.random() * 10 - 5),
        y: y + 10,
        vx: (Math.random() * 2 - 1) - this.wind * 0.05,
        vy: (Math.random() * 3 + 2),
        size: Math.random() * 8 + 6,
        color: `rgba(${180 + Math.random() * 30}, ${180 + Math.random() * 30}, ${180 + Math.random() * 30}, 0.5)`,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.02,
        type: 'smoke'
      });
    }
  }

  updateParticles(dt, velocity) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt * 20;
      // Particles move down in world space.
      // Since camera follows rocket, environment appears to scroll.
      // So particle y adjustment depends on rocket movement relative to frame.
      p.y += (p.vy - velocity * 0.5) * dt * 20;
      
      p.life -= p.decay;

      if (p.type === 'smoke') {
        p.size += dt * 15; // smoke expands
        p.vx += (Math.random() * 1 - 0.5) * dt * 5; // disperse
      } else if (p.type === 'fire') {
        p.size *= 0.95; // fire shrinks
      }

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // --- Environment Initialization ---
  initClouds() {
    this.clouds = [];
    const count = 6;
    for (let i = 0; i < count; i++) {
      this.clouds.push({
        x: Math.random() * 800 - 100,
        y: Math.random() * 600,
        size: Math.random() * 60 + 40,
        speedFactor: 0.4 + Math.random() * 0.4 // parallaxes
      });
    }
  }

  initStars() {
    this.stars = [];
    const count = 60;
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        size: Math.random() * 1.5 + 0.5,
        twinkle: Math.random()
      });
    }
  }

  updateEnvironment(altitude, velocity, dt) {
    // 1. Camera interpolation
    // Target camera is at rocket's altitude
    const targetCamY = altitude;
    this.camY += (targetCamY - this.camY) * 0.1;

    // 2. Wrap stars
    this.stars.forEach(star => {
      // Stars scroll downwards as rocket climbs
      // Since stars are infinitely far away, we scroll them very slowly
      star.y += (velocity * 0.05) * dt * this.worldScale;
      // twinke
      star.twinkle += dt * 2;
      if (star.twinkle > Math.PI * 2) star.twinkle = 0;

      // Wrap-around
      if (star.y > this.canvas.height) {
        star.y = 0;
        star.x = Math.random() * this.canvas.width;
      }
    });

    // 3. Update clouds
    this.clouds.forEach(cloud => {
      // Clouds drift with wind + scroll with rocket velocity
      cloud.x += this.wind * dt * cloud.speedFactor;
      cloud.y += (velocity * cloud.speedFactor) * dt * this.worldScale;

      // Wrap horizontal
      if (cloud.x > this.canvas.width + 100) {
        cloud.x = -150;
      }
      // Wrap vertical
      if (cloud.y > this.canvas.height + 100) {
        cloud.y = -150;
        cloud.x = Math.random() * this.canvas.width - 50;
        cloud.size = Math.random() * 60 + 40;
      }
    });
  }

  // --- Main Render Functions ---
  drawSky(altitude) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Sky colors based on altitude
    // 0m: Sky Blue [135, 206, 235] -> [79, 172, 254]
    // 300m: Deep Indigo [20, 30, 65]
    // 800m: Space Black [5, 5, 10]
    // 1500m+: Pitch Black [0, 0, 0]

    let colorTop = [135, 206, 235];
    let colorBottom = [190, 230, 245];

    if (altitude < 200) {
      // Interpolate from sea level to 200m
      const t = altitude / 200;
      colorTop = this.lerpColor([135, 206, 235], [40, 90, 150], t);
      colorBottom = this.lerpColor([190, 230, 245], [110, 180, 220], t);
    } else if (altitude < 700) {
      // 200m to 700m
      const t = (altitude - 200) / 500;
      colorTop = this.lerpColor([40, 90, 150], [15, 20, 45], t);
      colorBottom = this.lerpColor([110, 180, 220], [40, 80, 140], t);
    } else if (altitude < 1500) {
      // 700m to 1500m
      const t = (altitude - 700) / 800;
      colorTop = this.lerpColor([15, 20, 45], [2, 3, 8], t);
      colorBottom = this.lerpColor([40, 80, 140], [10, 15, 30], t);
    } else {
      // 1500m+ Space
      colorTop = [0, 0, 0];
      colorBottom = [2, 3, 8];
    }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `rgb(${colorTop[0]}, ${colorTop[1]}, ${colorTop[2]})`);
    grad.addColorStop(1, `rgb(${colorBottom[0]}, ${colorBottom[1]}, ${colorBottom[2]})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  lerpColor(c1, c2, t) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t)
    ];
  }

  drawStars(altitude) {
    if (altitude < 200) return; // Not visible in daylight

    const ctx = this.ctx;
    // Stars fade in as it gets higher
    const opacity = Math.min(1.0, (altitude - 200) / 600);
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#fff';

    this.stars.forEach(star => {
      const alpha = opacity * (0.3 + 0.7 * Math.abs(Math.sin(star.twinkle)));
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  drawClouds() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.clouds.forEach(cloud => {
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.size * 0.5, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 0.4, cloud.y - cloud.size * 0.1, cloud.size * 0.4, 0, Math.PI * 2);
      ctx.arc(cloud.x - cloud.size * 0.4, cloud.y - cloud.size * 0.05, cloud.size * 0.35, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 0.8, cloud.y + cloud.size * 0.05, cloud.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawGround(altitude) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Ground screen y position
    // Scroll ground down as rocket altitude increases
    const groundY = h - 60 - (0 - this.camY) * this.worldScale;

    // Only draw ground if it is near the screen view
    if (groundY < h + 150) {
      // Grassy field
      ctx.fillStyle = '#2d5e35';
      ctx.fillRect(0, groundY, w, h - groundY + 100);

      // Grass details / dirt layers
      ctx.fillStyle = '#1e3f24';
      ctx.fillRect(0, groundY + 10, w, 6);
      ctx.fillStyle = '#3a2512'; // Dirt under
      ctx.fillRect(0, groundY + 16, w, h - groundY);

      // Launch Pad Base Plate
      const padX = w / 2;
      ctx.fillStyle = '#4a5568';
      ctx.fillRect(padX - 40, groundY - 4, 80, 6);

      // Launch Rod (Rail)
      ctx.strokeStyle = '#cbd5e0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padX - 10, groundY - 4);
      ctx.lineTo(padX - 10, groundY - 240); // 3-meter launch rod representation
      ctx.stroke();

      // Launch rod clamp
      ctx.fillStyle = '#718096';
      ctx.fillRect(padX - 13, groundY - 30, 6, 8);
    }
  }

  drawRocket(state, config) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Rocket height is bodyLength + noseLength
    // Rocket horizontal is center of screen
    const rx = w / 2;

    // Calculate vertical screen position
    let ry = h - 60 - (state.altitude - this.camY) * this.worldScale;

    // Core dimensions
    const scaleFactor = 1.3; // scale up drawing sizes slightly for visibility
    const bodyL = config.bodyLength * scaleFactor;
    const bodyW = (config.bodyDiameter / 10) * scaleFactor * 3.5; // adjust width for display
    const noseL = config.noseLength * scaleFactor * 1.5;
    const finW = config.finSpan * scaleFactor * 2.5;
    const finH = bodyL * 0.25;

    // --- Choose skin material paint gradient/pattern (shared between body and nose cone) ---
    let materialGrad = ctx.createLinearGradient(rx - bodyW/2, 0, rx + bodyW/2, 0);
    if (config.bodyMaterial === 'cardboard') {
      materialGrad.addColorStop(0, '#c6a17b'); // cardboard matte highlight
      materialGrad.addColorStop(0.5, '#b08d68');
      materialGrad.addColorStop(1, '#8f7150');
    } else if (config.bodyMaterial === 'plastic') {
      materialGrad.addColorStop(0, '#ffffff'); // shiny plastic reflection
      materialGrad.addColorStop(0.3, '#f7fafc');
      materialGrad.addColorStop(0.7, '#e2e8f0');
      materialGrad.addColorStop(1, '#cbd5e0');
    } else if (config.bodyMaterial === 'fiberglass') {
      materialGrad.addColorStop(0, '#e2e8f0'); // translucent yellowish/grey
      materialGrad.addColorStop(0.5, '#cbd5e0');
      materialGrad.addColorStop(1, '#a0aec0');
    } else { // carbonfiber
      materialGrad.addColorStop(0, '#2d3748'); // carbon dark sheen
      materialGrad.addColorStop(0.5, '#1a202c');
      materialGrad.addColorStop(1, '#0f1219');
    }

    // 1. Draw Parachute Canopy & Lines
    if (state.phase === 'parachute' && state.parachuteDeployed) {
      const paraD = config.parachuteDiameter * 1.8;
      const paraY = ry - bodyL - noseL - 90;

      // Draw lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Lines connecting nose cone top to canopy edges
      ctx.moveTo(rx, ry - bodyL - noseL);
      ctx.lineTo(rx - paraD/2, paraY + 10);
      ctx.moveTo(rx, ry - bodyL - noseL);
      ctx.lineTo(rx - paraD/4, paraY + 10);
      ctx.moveTo(rx, ry - bodyL - noseL);
      ctx.lineTo(rx + paraD/4, paraY + 10);
      ctx.moveTo(rx, ry - bodyL - noseL);
      ctx.lineTo(rx + paraD/2, paraY + 10);
      ctx.stroke();

      // Draw canopy
      ctx.fillStyle = '#e53e3e'; // Orange-red parachute
      ctx.beginPath();
      ctx.arc(rx, paraY + 10, paraD / 2, Math.PI, 0); // Semicircle dome
      ctx.closePath();
      ctx.fill();

      // Parachute stripes (aesthetic)
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(rx - paraD/6, paraY + 10);
      ctx.arc(rx, paraY + 10, paraD/2, Math.PI + Math.PI/3, Math.PI + 2*Math.PI/3);
      ctx.lineTo(rx + paraD/6, paraY + 10);
      ctx.closePath();
      ctx.fill();
    }

    // 1.5 Draw Motor Overhang (sticks out bottom of the tube)
    const overhangL = (config.motorOverhang || 0) * scaleFactor * 5;
    if (overhangL > 0) {
      const casingW = bodyW * 0.55; // standard motor casing is narrower than fuselage
      ctx.save();
      // Cardboard-colored engine casing
      let casingGrad = ctx.createLinearGradient(rx - casingW/2, 0, rx + casingW/2, 0);
      casingGrad.addColorStop(0, '#cda276');
      casingGrad.addColorStop(0.5, '#b88d60');
      casingGrad.addColorStop(1, '#977045');
      ctx.fillStyle = casingGrad;
      ctx.fillRect(rx - casingW/2, ry, casingW, overhangL);

      // Clay nozzle base ring
      ctx.fillStyle = '#444444';
      ctx.fillRect(rx - casingW/2 + 2, ry + overhangL - 3, casingW - 4, 3);
      ctx.restore();
    }

    // 2. Draw Flame & Exhaust Glow (positioned from nozzle end)
    if (state.phase === 'thrust' && state.thrustForce > 0) {
      const nozzleY = ry + overhangL;
      const flameH = (state.thrustForce / config.motor.maxThrust) * 60 + Math.random() * 15;
      
      // Outer fire
      const gradFlame = ctx.createLinearGradient(rx - bodyW/2, nozzleY, rx + bodyW/2, nozzleY + flameH);
      gradFlame.addColorStop(0, '#ffcc00');
      gradFlame.addColorStop(0.3, '#ff6600');
      gradFlame.addColorStop(1, 'rgba(255, 0, 0, 0)');
      
      ctx.fillStyle = gradFlame;
      ctx.beginPath();
      ctx.moveTo(rx - bodyW/2 + 2, nozzleY);
      ctx.quadraticCurveTo(rx - bodyW, nozzleY + flameH*0.4, rx, nozzleY + flameH);
      ctx.quadraticCurveTo(rx + bodyW, nozzleY + flameH*0.4, rx + bodyW/2 - 2, nozzleY);
      ctx.closePath();
      ctx.fill();

      // Inner flame core (hot white/cyan)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(rx - bodyW/4, nozzleY);
      ctx.lineTo(rx, nozzleY + flameH * 0.4);
      ctx.lineTo(rx + bodyW/4, nozzleY);
      ctx.closePath();
      ctx.fill();

      // Spark particles injection
      this.spawnExhaust(rx, nozzleY, state.thrustForce, state.phase, state.velocity);
    }

    // 3. Draw Fins (behind/around the body)
    ctx.fillStyle = '#4a5568'; // dark fin color
    const finY = ry;
    
    if (config.finType === 'swept') {
      // Left Fin
      ctx.beginPath();
      ctx.moveTo(rx - bodyW/2, finY - finH);
      ctx.lineTo(rx - bodyW/2 - finW, finY);
      ctx.lineTo(rx - bodyW/2 - finW + 8, finY);
      ctx.lineTo(rx - bodyW/2, finY - 4);
      ctx.closePath();
      ctx.fill();

      // Right Fin
      ctx.beginPath();
      ctx.moveTo(rx + bodyW/2, finY - finH);
      ctx.lineTo(rx + bodyW/2 + finW, finY);
      ctx.lineTo(rx + bodyW/2 + finW - 8, finY);
      ctx.lineTo(rx + bodyW/2, finY - 4);
      ctx.closePath();
      ctx.fill();
    } else if (config.finType === 'trapezoidal') {
      // Left Fin
      ctx.beginPath();
      ctx.moveTo(rx - bodyW/2, finY - finH * 1.2);
      ctx.lineTo(rx - bodyW/2 - finW, finY - finH * 0.3);
      ctx.lineTo(rx - bodyW/2 - finW, finY);
      ctx.lineTo(rx - bodyW/2, finY);
      ctx.closePath();
      ctx.fill();

      // Right Fin
      ctx.beginPath();
      ctx.moveTo(rx + bodyW/2, finY - finH * 1.2);
      ctx.lineTo(rx + bodyW/2 + finW, finY - finH * 0.3);
      ctx.lineTo(rx + bodyW/2 + finW, finY);
      ctx.lineTo(rx + bodyW/2, finY);
      ctx.closePath();
      ctx.fill();
    } else if (config.finType === 'hexagonal') {
      // Left Fin (6 points half-hexagon)
      ctx.beginPath();
      ctx.moveTo(rx - bodyW/2, finY - finH);
      ctx.lineTo(rx - bodyW/2 - finW, finY - finH * 0.6);
      ctx.lineTo(rx - bodyW/2 - finW, finY - finH * 0.2);
      ctx.lineTo(rx - bodyW/2, finY);
      ctx.closePath();
      ctx.fill();

      // Right Fin
      ctx.beginPath();
      ctx.moveTo(rx + bodyW/2, finY - finH);
      ctx.lineTo(rx + bodyW/2 + finW, finY - finH * 0.6);
      ctx.lineTo(rx + bodyW/2 + finW, finY - finH * 0.2);
      ctx.lineTo(rx + bodyW/2, finY);
      ctx.closePath();
      ctx.fill();
    } else { // Elliptical
      // Left Ellipse
      ctx.beginPath();
      ctx.ellipse(rx - bodyW/2 - finW/2, finY - finH/2, finW/2, finH/2, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Right Ellipse
      ctx.beginPath();
      ctx.ellipse(rx + bodyW/2 + finW/2, finY - finH/2, finW/2, finH/2, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Draw Main Rocket Body Tube
    const bodyY = ry - bodyL;
    ctx.save();
    ctx.fillStyle = materialGrad;
    ctx.fillRect(rx - bodyW/2, bodyY, bodyW, bodyL);

    // Carbon Fiber details grid overlay (drawn using thin dark diagonal ticks)
    if (config.bodyMaterial === 'carbonfiber') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let yOffset = bodyY; yOffset < ry; yOffset += 6) {
        ctx.moveTo(rx - bodyW/2, yOffset);
        ctx.lineTo(rx + bodyW/2, yOffset + 6);
      }
      ctx.stroke();
    }

    // Decorative decal line
    ctx.fillStyle = '#ff3366'; // neon red detail band near nose
    ctx.fillRect(rx - bodyW/2, bodyY + 10, bodyW, 6);
    ctx.restore();

    // 5. Draw Nose Cone (material color matching the body)
    const noseY = bodyY - noseL;
    ctx.save();
    
    // Draw nose cone path
    ctx.beginPath();
    if (config.noseType === 'conical') {
      ctx.moveTo(rx - bodyW/2, bodyY);
      ctx.lineTo(rx, noseY);
      ctx.lineTo(rx + bodyW/2, bodyY);
    } else if (config.noseType === 'ogive') {
      ctx.moveTo(rx - bodyW/2, bodyY);
      ctx.quadraticCurveTo(rx - bodyW/2, bodyY - noseL * 0.6, rx, noseY);
      ctx.quadraticCurveTo(rx + bodyW/2, bodyY - noseL * 0.6, rx + bodyW/2, bodyY);
    } else if (config.noseType === 'haack') {
      ctx.moveTo(rx - bodyW/2, bodyY);
      // Double cubic curves to approximate sleek von Karman shape
      ctx.bezierCurveTo(rx - bodyW/2, bodyY - noseL * 0.35, rx - bodyW/4, noseY + noseL * 0.15, rx, noseY);
      ctx.bezierCurveTo(rx + bodyW/4, noseY + noseL * 0.15, rx + bodyW/2, bodyY - noseL * 0.35, rx + bodyW/2, bodyY);
    } else { // Parabolic
      ctx.moveTo(rx - bodyW/2, bodyY);
      ctx.bezierCurveTo(rx - bodyW/2, bodyY - noseL * 0.4, rx - bodyW/4, noseY, rx, noseY);
      ctx.bezierCurveTo(rx + bodyW/4, noseY, rx + bodyW/2, bodyY - noseL * 0.4, rx + bodyW/2, bodyY);
    }
    ctx.closePath();
    ctx.fillStyle = materialGrad;
    ctx.fill();

    // Render Carbon Fiber texture on nose cone if selected (using clipping)
    if (config.bodyMaterial === 'carbonfiber') {
      ctx.clip();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let yOffset = noseY; yOffset < bodyY; yOffset += 6) {
        ctx.moveTo(rx - bodyW/2, yOffset);
        ctx.lineTo(rx + bodyW/2, yOffset + 6);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles() {
    const ctx = this.ctx;
    this.particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Draw scrolling altitude indicator tape on right side
  drawAltitudeTape(state) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // HUD Tape Settings
    const tapeX = w - 40;
    const tapeStartY = 100;
    const tapeHeight = h - 160;

    ctx.save();
    
    // Draw background bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.2)';
    ctx.lineWidth = 1;
    ctx.fillRect(tapeX, tapeStartY, 25, tapeHeight);
    ctx.strokeRect(tapeX, tapeStartY, 25, tapeHeight);

    // Draw ticks
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
    ctx.fillStyle = 'rgba(0, 242, 254, 0.7)';
    ctx.font = '8px Orbitron';
    ctx.textAlign = 'right';

    // The scale scroll offsets relative to active camera altitude
    const meterStep = 10; // Ticks every 10 meters
    const pixelPerMeter = 2.5; // Compact tick representation
    
    // Determine bounds in world space
    const centerAlt = state.altitude;
    const startAlt = Math.max(0, Math.floor((centerAlt - (tapeHeight / (2 * pixelPerMeter))) / meterStep) * meterStep);
    const endAlt = Math.ceil((centerAlt + (tapeHeight / (2 * pixelPerMeter))) / meterStep) * meterStep;

    for (let alt = startAlt; alt <= endAlt; alt += meterStep) {
      // Screen Y calculation relative to tape center
      const diffY = (alt - centerAlt) * pixelPerMeter;
      const tickY = (tapeStartY + tapeHeight/2) - diffY;

      if (tickY >= tapeStartY && tickY <= tapeStartY + tapeHeight) {
        ctx.beginPath();
        // Major ticks are every 50m, minor every 10m
        if (alt % 50 === 0) {
          ctx.moveTo(tapeX, tickY);
          ctx.lineTo(tapeX + 12, tickY);
          ctx.stroke();
          ctx.fillText(alt + 'm', tapeX - 5, tickY + 3);
        } else {
          ctx.moveTo(tapeX, tickY);
          ctx.lineTo(tapeX + 6, tickY);
          ctx.stroke();
        }
      }
    }

    // Indicator caret at center height of tape
    const caretY = tapeStartY + tapeHeight/2;
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.moveTo(tapeX - 10, caretY);
    ctx.lineTo(tapeX - 2, caretY - 5);
    ctx.lineTo(tapeX - 2, caretY + 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // --- Main Animation Frame Draw ---
  render(state, config, dt) {
    // 1. Clear background
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Physics & coordinate updates
    this.updateParticles(dt, state.velocity);
    this.updateEnvironment(state.altitude, state.velocity, dt);

    // 3. Render layers
    this.drawSky(state.altitude);
    this.drawStars(state.altitude);
    this.drawClouds();
    this.drawGround(state.altitude);
    this.drawParticles();
    
    // Draw launch rod behind rocket if it's there
    this.drawRocket(state, config);
    this.drawAltitudeTape(state);

    // 4. Update synthesizer params
    this.updateSound(state.thrustForce, state.altitude, state.velocity);
  }
}

window.RocketSimulation = RocketSimulation;
