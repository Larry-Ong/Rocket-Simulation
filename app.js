/**
 * AeroVanguard Simulator Controller & Integration
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- State Variables ---
  let sessionTopVelocity = 0;
  let sessionTopAltitude = 0;
  let rocketState = {
    phase: 'ready', // ready, thrust, coast, parachute, landed
    time: 0,
    altitude: 0,
    velocity: 0,
    acceleration: 0,
    propellantMass: 0,
    totalMass: 0,
    emptyMass: 0,
    motorMass: 0,
    dragCoefficient: 0.25,
    maxAltitude: 0,
    maxVelocity: 0,
    maxAcceleration: 0,
    thrustForce: 0,
    dragForce: 0,
    gravityForce: 0,
    parachuteDeployed: false,
    burnTimeElapsed: 0
  };

  let rocketConfig = {
    motor: null,
    smartEjection: true,
    bodyLength: 45,
    bodyDiameter: 34,
    bodyMaterial: 'carbonfiber',
    noseType: 'ogive',
    noseLength: 8,
    finType: 'swept',
    finCount: 4,
    finSpan: 4,
    parachuteDiameter: 30,
    wallThickness: 1.2,
    motorOverhang: 1.0
  };

  let telemetryLog = [];
  let logSampleTimer = 0;
  const logSampleRate = 0.05; // Sample metrics for charts every 0.05 seconds of flight time

  // Animation frame loop control
  let lastTime = performance.now();
  let animationId = null;
  let isRunning = false;

  // Auto-Cycle Loop timers
  let autoCycleTimer = null;
  let autoLaunchTimer = null;
  let autoCycleActive = false;

  // Chart configuration
  let telemetryChart = null;
  let activeChartTab = 'altitude'; // altitude, velocity, acceleration, forces

  // Simulation instance
  const sim = new RocketSimulation('sim-canvas');

  // --- DOM Elements ---
  const elMaxThrust = document.getElementById('custom-max-thrust');
  const elAvgThrust = document.getElementById('custom-avg-thrust');
  const elBurnTime = document.getElementById('custom-burn-time');
  const elPropellantMass = document.getElementById('custom-propellant-mass');
  const elCasingMass = document.getElementById('custom-casing-mass');

  const elMaxThrustVal = document.getElementById('custom-max-thrust-val');
  const elAvgThrustVal = document.getElementById('custom-avg-thrust-val');
  const elBurnTimeVal = document.getElementById('custom-burn-time-val');
  const elPropellantMassVal = document.getElementById('custom-propellant-mass-val');
  const elCasingMassVal = document.getElementById('custom-casing-mass-val');

  const dropdownMotor = document.getElementById('motor-preset');
  const customMotorControls = document.getElementById('custom-motor-controls');
  const sliderEjectionDelay = document.getElementById('ejection-delay');
  const valEjectionDelay = document.getElementById('ejection-delay-val');
  const sliderMotorOverhang = document.getElementById('motor-overhang');
  const valMotorOverhang = document.getElementById('motor-overhang-val');

  const dropdownMaterial = document.getElementById('body-material');
  const sliderLength = document.getElementById('body-length');
  const valLength = document.getElementById('body-length-val');
  const sliderDiameter = document.getElementById('body-diameter');
  const valDiameter = document.getElementById('body-diameter-val');
  const sliderWallThickness = document.getElementById('wall-thickness');
  const valWallThickness = document.getElementById('wall-thickness-val');

  const dropdownNose = document.getElementById('nose-type');
  const sliderNoseLength = document.getElementById('nose-length');
  const valNoseLength = document.getElementById('nose-length-val');

  const dropdownFin = document.getElementById('fin-type');
  const sliderFinCount = document.getElementById('fin-count');
  const valFinCount = document.getElementById('fin-count-val');
  const sliderFinSpan = document.getElementById('fin-span');
  const valFinSpan = document.getElementById('fin-span-val');

  const sliderParachute = document.getElementById('parachute-diameter');
  const valParachute = document.getElementById('parachute-diameter-val');
  const checkSmartEjection = document.getElementById('smart-ejection');

  const valEmptyMass = document.getElementById('empty-mass-val');
  const valLiftoffMass = document.getElementById('liftoff-mass-val');
  const valCdEstimate = document.getElementById('cd-estimate-val');

  const btnLaunch = document.getElementById('btn-launch');
  const btnReset = document.getElementById('btn-reset');
  const checkAutoCycle = document.getElementById('toggle-autocycle');
  const checkSound = document.getElementById('toggle-sound');

  const systemLed = document.getElementById('system-status-led');
  const systemStatusText = document.getElementById('system-status-text');

  // HUD elements
  const hudPhase = document.getElementById('hud-phase');
  const hudAltitude = document.getElementById('hud-altitude');
  const hudVelocity = document.getElementById('hud-velocity');
  const hudAcceleration = document.getElementById('hud-acceleration');
  const hudFuel = document.getElementById('hud-fuel');

  // Stats cards
  const statMaxAlt = document.getElementById('stat-max-alt');
  const statMaxVel = document.getElementById('stat-max-vel');
  const statMaxAcc = document.getElementById('stat-max-acc');
  const statBurnDur = document.getElementById('stat-burn-dur');
  const statTimeApogee = document.getElementById('stat-time-apogee');
  const statFlightTime = document.getElementById('stat-flight-time');

  // --- Mass & Aerodynamic Calculation Updates ---
  function updateCalculatedSpecs() {
    // 1. Gather configuration parameters
    rocketConfig.bodyLength = parseFloat(sliderLength.value);
    rocketConfig.bodyDiameter = parseFloat(sliderDiameter.value);
    rocketConfig.bodyMaterial = dropdownMaterial.value;
    rocketConfig.wallThickness = parseFloat(sliderWallThickness.value);
    rocketConfig.motorOverhang = parseFloat(sliderMotorOverhang.value);
    
    rocketConfig.noseType = dropdownNose.value;
    rocketConfig.noseLength = parseFloat(sliderNoseLength.value);
    
    rocketConfig.finType = dropdownFin.value;
    rocketConfig.finCount = parseInt(sliderFinCount.value, 10);
    rocketConfig.finSpan = parseFloat(sliderFinSpan.value);
    
    rocketConfig.parachuteDiameter = parseFloat(sliderParachute.value);
    rocketConfig.smartEjection = checkSmartEjection.checked;

    // 2. Fetch motor settings
    const selectedMotorPreset = dropdownMotor.value;
    if (selectedMotorPreset === 'custom') {
      customMotorControls.classList.remove('hidden');
      rocketConfig.motor = {
        name: 'Custom Motor',
        maxThrust: parseFloat(elMaxThrust.value),
        avgThrust: parseFloat(elAvgThrust.value),
        burnTime: parseFloat(elBurnTime.value),
        propellantMass: parseFloat(elPropellantMass.value) / 1000, // g to kg
        motorMass: (parseFloat(elPropellantMass.value) + parseFloat(elCasingMass.value)) / 1000, // g to kg
        delay: parseFloat(sliderEjectionDelay.value)
      };
    } else {
      customMotorControls.classList.add('hidden');
      const motorPreset = RocketPhysics.MOTOR_PRESETS[selectedMotorPreset];
      // Override delay from user slider
      rocketConfig.motor = { ...motorPreset, delay: parseFloat(sliderEjectionDelay.value) };
    }

    // 3. Compute empty mass, Cd and Liftoff mass
    rocketState.emptyMass = RocketPhysics.calculateEmptyMass(rocketConfig);
    rocketState.motorMass = rocketConfig.motor.motorMass;
    rocketState.dragCoefficient = RocketPhysics.calculateDragCoefficient(rocketConfig);

    const totalEmptyMassG = Math.round(rocketState.emptyMass * 1000);
    const totalLiftoffMassG = Math.round((rocketState.emptyMass + rocketState.motorMass) * 1000);

    // Update panel displays
    valEmptyMass.textContent = totalEmptyMassG;
    valLiftoffMass.textContent = totalLiftoffMassG;
    valCdEstimate.textContent = rocketState.dragCoefficient.toFixed(2);
  }

  // --- Dynamic UI Slider Value Synchronizations ---
  function registerSliderSync(slider, valueDisplay, callback) {
    slider.addEventListener('input', (e) => {
      valueDisplay.textContent = e.target.value;
      if (callback) callback();
      updateCalculatedSpecs();
    });
  }

  registerSliderSync(sliderLength, valLength);
  registerSliderSync(sliderDiameter, valDiameter);
  registerSliderSync(sliderNoseLength, valNoseLength);
  registerSliderSync(sliderFinCount, valFinCount);
  registerSliderSync(sliderFinSpan, valFinSpan);
  registerSliderSync(sliderParachute, valParachute);
  registerSliderSync(sliderEjectionDelay, valEjectionDelay);
  registerSliderSync(sliderMotorOverhang, valMotorOverhang);
  registerSliderSync(sliderWallThickness, valWallThickness);

  // Custom motor sliders sync
  registerSliderSync(elMaxThrust, elMaxThrustVal);
  registerSliderSync(elAvgThrust, elAvgThrustVal);
  registerSliderSync(elBurnTime, elBurnTimeVal);
  registerSliderSync(elPropellantMass, elPropellantMassVal);
  registerSliderSync(elCasingMass, elCasingMassVal);

  // Preset rocket configuration values for each motor preset to ensure launch suitability
  const MOTOR_ROCKET_PRESETS = {
    'A8-3': {
      material: 'cardboard',
      length: 25,
      diameter: 18,
      wallThickness: 0.8,
      noseType: 'ogive',
      noseLength: 5,
      finType: 'swept',
      finCount: 3,
      finSpan: 2.5,
      parachute: 20,
      delay: 3
    },
    'B6-4': {
      material: 'cardboard',
      length: 35,
      diameter: 24,
      wallThickness: 1.0,
      noseType: 'ogive',
      noseLength: 6,
      finType: 'swept',
      finCount: 3,
      finSpan: 3.0,
      parachute: 25,
      delay: 4
    },
    'C6-5': {
      material: 'plastic',
      length: 45,
      diameter: 34,
      wallThickness: 1.2,
      noseType: 'ogive',
      noseLength: 8,
      finType: 'swept',
      finCount: 4,
      finSpan: 4.0,
      parachute: 30,
      delay: 5
    },
    'D12-5': {
      material: 'fiberglass',
      length: 60,
      diameter: 42,
      wallThickness: 1.5,
      noseType: 'ogive',
      noseLength: 10,
      finType: 'swept',
      finCount: 4,
      finSpan: 5.0,
      parachute: 40,
      delay: 5
    },
    'icbm': {
      material: 'carbonfiber',
      length: 90,
      diameter: 55,
      wallThickness: 2.5,
      noseType: 'haack',
      noseLength: 15,
      finType: 'swept',
      finCount: 4,
      finSpan: 8.0,
      parachute: 60,
      delay: 5
    }
  };

  function applyRocketPresetForMotor(motorKey) {
    const preset = MOTOR_ROCKET_PRESETS[motorKey];
    if (!preset) return;

    // Update input values
    dropdownMaterial.value = preset.material;
    sliderLength.value = preset.length;
    sliderDiameter.value = preset.diameter;
    sliderWallThickness.value = preset.wallThickness;
    dropdownNose.value = preset.noseType;
    sliderNoseLength.value = preset.noseLength;
    dropdownFin.value = preset.finType;
    sliderFinCount.value = preset.finCount;
    sliderFinSpan.value = preset.finSpan;
    sliderParachute.value = preset.parachute;
    sliderEjectionDelay.value = preset.delay;

    // Update text labels
    valLength.textContent = preset.length;
    valDiameter.textContent = preset.diameter;
    valWallThickness.textContent = preset.wallThickness.toFixed(1);
    valNoseLength.textContent = preset.noseLength.toFixed(1);
    valFinCount.textContent = preset.finCount;
    valFinSpan.textContent = preset.finSpan.toFixed(1);
    valParachute.textContent = preset.parachute;
    valEjectionDelay.textContent = preset.delay;
  }

  dropdownMotor.addEventListener('change', (e) => {
    applyRocketPresetForMotor(e.target.value);
    updateCalculatedSpecs();
  });
  dropdownMaterial.addEventListener('change', () => updateCalculatedSpecs());
  dropdownNose.addEventListener('change', () => updateCalculatedSpecs());
  dropdownFin.addEventListener('change', () => updateCalculatedSpecs());
  checkSmartEjection.addEventListener('change', () => updateCalculatedSpecs());

  checkSound.addEventListener('change', (e) => {
    sim.setSoundEnabled(e.target.checked);
  });

  // --- Simulation Management Controls ---
  function launchRocket() {
    // Prevent launch if running or in launch phase
    if (rocketState.phase !== 'ready' && rocketState.phase !== 'landed') return;

    // Clear auto timers
    clearTimeout(autoCycleTimer);
    clearTimeout(autoLaunchTimer);

    // If landed, reset first
    if (rocketState.phase === 'landed') {
      resetSimulation();
    }

    updateCalculatedSpecs(); // Ensure latest settings are loaded

    rocketState.phase = 'thrust';
    rocketState.time = 0;
    rocketState.altitude = 0;
    rocketState.velocity = 0;
    rocketState.acceleration = 0;
    rocketState.propellantMass = rocketConfig.motor.propellantMass;
    rocketState.totalMass = rocketState.emptyMass + rocketState.motorMass;
    rocketState.maxAltitude = 0;
    rocketState.maxVelocity = 0;
    rocketState.maxAcceleration = 0;
    rocketState.parachuteDeployed = false;
    rocketState.burnTimeElapsed = 0;

    telemetryLog = [{
      time: 0,
      altitude: 0,
      velocity: 0,
      accelerationG: 0,
      thrust: 0,
      drag: 0,
      gravity: rocketState.totalMass * 9.81
    }];
    logSampleTimer = 0;

    btnLaunch.disabled = true;
    dropdownMotor.disabled = true;
    disableSliders(true);

    systemLed.className = 'led active';
    systemStatusText.textContent = 'LAUNCH INITIATED - ENGINE FIRED';

    sim.startSound();
    
    if (!isRunning) {
      isRunning = true;
      lastTime = performance.now();
      animationId = requestAnimationFrame(simLoop);
    }
  }

  function resetSimulation() {
    clearTimeout(autoCycleTimer);
    clearTimeout(autoLaunchTimer);
    autoCycleActive = false;

    sim.stopSound();
    rocketState.phase = 'ready';
    rocketState.time = 0;
    rocketState.altitude = 0;
    rocketState.velocity = 0;
    rocketState.acceleration = 0;
    rocketState.maxAltitude = 0;
    rocketState.maxVelocity = 0;
    rocketState.maxAcceleration = 0;
    rocketState.parachuteDeployed = false;
    rocketState.burnTimeElapsed = 0;

    telemetryLog = [];

    btnLaunch.disabled = false;
    dropdownMotor.disabled = false;
    disableSliders(false);

    systemLed.className = 'led ready';
    systemStatusText.textContent = 'SYSTEM READY';

    updateHUD();
    updateSummaryStats();
    initTelemetryChart(); // Clear charts

    sim.particles = [];
    sim.camY = 0;
  }

  function disableSliders(disable) {
    const inputs = document.querySelectorAll('.config-panel input, .config-panel select');
    inputs.forEach(input => {
      // Keep controls like reset, autocycle, sound enabled
      if (input.id !== 'toggle-autocycle' && input.id !== 'toggle-sound' && input.id !== 'btn-reset') {
        input.disabled = disable;
      }
    });
  }

  btnLaunch.addEventListener('click', launchRocket);
  btnReset.addEventListener('click', resetSimulation);

  // --- Real-time Animation Loop ---
  function simLoop(now) {
    if (!isRunning) return;

    let dt = (now - lastTime) / 1000;
    lastTime = now;

    // Cap delta time to avoid large physics steps when tab lags
    if (dt > 0.05) dt = 0.05;

    // Physics step
    const prevPhase = rocketState.phase;
    const prevPara = rocketState.parachuteDeployed;

    rocketState = RocketPhysics.updatePhysicsStep(rocketState, rocketConfig, dt);

    // Audio effects for state changes
    if (rocketState.parachuteDeployed && !prevPara) {
      sim.playEjectionSound();
    }
    if (rocketState.phase === 'landed' && prevPhase !== 'landed') {
      sim.playLandingSound();
      sim.stopSound();
      handleFlightCompletion();
    }

    // Telemetry logging
    if (rocketState.phase !== 'ready' && rocketState.phase !== 'landed') {
      logSampleTimer += dt;
      if (logSampleTimer >= logSampleRate) {
        logSampleTimer = 0;
        telemetryLog.push({
          time: rocketState.time,
          altitude: rocketState.altitude,
          velocity: rocketState.velocity,
          accelerationG: rocketState.acceleration / 9.80665,
          thrust: rocketState.thrustForce,
          drag: rocketState.dragForce,
          gravity: rocketState.gravityForce
        });
        
        // Dynamic chart updates during flight (throttled redraw)
        if (telemetryLog.length % 5 === 0) {
          updateChartData();
        }
      }
    }

    // Canvas render
    sim.render(rocketState, rocketConfig, dt);

    // UI Updates
    updateHUD();

    if (rocketState.phase !== 'landed') {
      animationId = requestAnimationFrame(simLoop);
    } else {
      isRunning = false;
    }
  }

  function handleFlightCompletion() {
    systemLed.className = 'led ready';
    systemStatusText.textContent = 'FLIGHT DATA RECOVERED';
    
    // Complete remaining stats and update chart fully
    updateSummaryStats();
    updateChartData();

    // Trigger Auto-Cycle loop if toggled
    if (checkAutoCycle.checked) {
      autoCycleActive = true;
      let countdown = 4;
      systemStatusText.textContent = `FLIGHT COMPLETE. AUTO-RESET IN ${countdown}s...`;
      systemLed.className = 'led active';

      autoCycleTimer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          systemStatusText.textContent = `FLIGHT COMPLETE. AUTO-RESET IN ${countdown}s...`;
        } else {
          clearInterval(autoCycleTimer);
          systemStatusText.textContent = 'RESETTING TELEMETRY...';
          resetSimulation();
          
          // Auto launch after 1 second
          autoLaunchTimer = setTimeout(() => {
            systemStatusText.textContent = 'AUTO-LAUNCH SEQUENCE INITIATED...';
            launchRocket();
          }, 1000);
        }
      }, 1000);
    } else {
      btnLaunch.disabled = false;
    }
  }

  // --- Telemetry Dashboard & HUD Render ---
  function updateHUD() {
    hudPhase.textContent = rocketState.phase.toUpperCase();
    
    // Color phase hud text based on status
    if (rocketState.phase === 'thrust') {
      hudPhase.style.color = 'var(--accent-amber)';
    } else if (rocketState.phase === 'coast') {
      hudPhase.style.color = 'var(--accent-blue)';
    } else if (rocketState.phase === 'parachute') {
      hudPhase.style.color = 'var(--accent-green)';
    } else if (rocketState.phase === 'landed') {
      hudPhase.style.color = 'var(--text-secondary)';
    } else {
      hudPhase.style.color = 'var(--accent-cyan)';
    }

    hudAltitude.textContent = rocketState.altitude.toFixed(1);
    hudVelocity.textContent = rocketState.velocity.toFixed(1);
    
    const accG = rocketState.acceleration / 9.80665;
    hudAcceleration.textContent = accG.toFixed(2);

    // Propellant display percentage
    const maxFuel = rocketConfig.motor.propellantMass;
    const pct = maxFuel > 0 ? (rocketState.propellantMass / maxFuel) * 100 : 0;
    hudFuel.textContent = Math.round(pct);

    // Update Session Top Velocity & Altitude
    if (rocketState.maxVelocity > sessionTopVelocity) {
      sessionTopVelocity = rocketState.maxVelocity;
    }
    if (rocketState.maxAltitude > sessionTopAltitude) {
      sessionTopAltitude = rocketState.maxAltitude;
    }
    
    const headerTopVel = document.getElementById('header-top-velocity');
    if (headerTopVel) {
      headerTopVel.textContent = sessionTopVelocity.toFixed(1) + ' m/s';
    }
    const headerTopAlt = document.getElementById('header-top-altitude');
    if (headerTopAlt) {
      headerTopAlt.textContent = sessionTopAltitude.toFixed(1) + ' m';
    }
  }

  function updateSummaryStats() {
    statMaxAlt.textContent = `${rocketState.maxAltitude.toFixed(1)} m`;
    statMaxVel.textContent = `${rocketState.maxVelocity.toFixed(1)} m/s`;
    statMaxAcc.textContent = `${rocketState.maxAcceleration.toFixed(2)} G`;
    statBurnDur.textContent = `${rocketConfig.motor.burnTime.toFixed(1)} s`;

    // Estimate time to apogee
    // Find time stamp in log where velocity becomes near zero
    let apogeeTime = 0;
    let maxA = 0;
    for (let i = 0; i < telemetryLog.length; i++) {
      if (telemetryLog[i].altitude >= maxA) {
        maxA = telemetryLog[i].altitude;
        apogeeTime = telemetryLog[i].time;
      }
    }
    statTimeApogee.textContent = `${apogeeTime.toFixed(2)} s`;
    statFlightTime.textContent = `${rocketState.time.toFixed(1)} s`;
  }

  // --- Telemetry Graphing System (Chart.js) ---
  function initTelemetryChart() {
    const ctx = document.getElementById('telemetry-chart').getContext('2d');
    
    if (telemetryChart) {
      telemetryChart.destroy();
    }

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    telemetryChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        elements: {
          point: { radius: 0, hoverRadius: 4 },
          line: { tension: 0.1 }
        },
        plugins: {
          legend: {
            display: false,
            labels: { font: { family: 'Space Grotesk', size: 10, weight: 600 } }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(10, 14, 23, 0.95)',
            titleColor: '#06b6d4',
            titleFont: { family: 'Space Grotesk', weight: 'bold' },
            bodyFont: { family: 'Inter' },
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Time (seconds)', font: { family: 'Space Grotesk', size: 10, weight: 600 }, color: '#94a3b8' },
            grid: { color: 'rgba(255, 255, 255, 0.03)' },
            border: { color: 'rgba(255, 255, 255, 0.08)' }
          },
          y: {
            title: { display: true, text: 'Altitude (m)', font: { family: 'Space Grotesk', size: 10, weight: 600 }, color: '#94a3b8' },
            grid: { color: 'rgba(255, 255, 255, 0.03)' },
            border: { color: 'rgba(255, 255, 255, 0.08)' }
          }
        }
      }
    });

    updateChartData();
  }

  function updateChartData() {
    if (!telemetryChart || telemetryLog.length === 0) return;

    const times = telemetryLog.map(d => d.time.toFixed(2));
    telemetryChart.data.labels = times;

    let dataset = [];
    let yTitle = '';

    if (activeChartTab === 'altitude') {
      yTitle = 'Altitude (meters)';
      dataset = [{
        label: 'Altitude (m)',
        data: telemetryLog.map(d => d.altitude),
        borderColor: '#06b6d4',
        borderWidth: 2,
        fill: true,
        backgroundColor: 'rgba(6, 182, 212, 0.04)'
      }];
      telemetryChart.options.plugins.legend.display = false;
    } else if (activeChartTab === 'velocity') {
      yTitle = 'Velocity (m/s)';
      dataset = [{
        label: 'Velocity (m/s)',
        data: telemetryLog.map(d => d.velocity),
        borderColor: '#3b82f6',
        borderWidth: 2,
        fill: true,
        backgroundColor: 'rgba(59, 130, 246, 0.04)'
      }];
      telemetryChart.options.plugins.legend.display = false;
    } else if (activeChartTab === 'acceleration') {
      yTitle = 'G-Force (Gs)';
      dataset = [{
        label: 'Acceleration (Gs)',
        data: telemetryLog.map(d => d.accelerationG),
        borderColor: '#f59e0b',
        borderWidth: 2,
        fill: true,
        backgroundColor: 'rgba(245, 158, 11, 0.04)'
      }];
      telemetryChart.options.plugins.legend.display = false;
    } else if (activeChartTab === 'forces') {
      yTitle = 'Force (Newtons)';
      dataset = [
        {
          label: 'Thrust (N)',
          data: telemetryLog.map(d => d.thrust),
          borderColor: '#ef4444',
          borderWidth: 1.5,
          fill: false
        },
        {
          label: 'Drag Force (N)',
          data: telemetryLog.map(d => d.drag),
          borderColor: '#06b6d4',
          borderWidth: 1.5,
          fill: false
        },
        {
          label: 'Gravity (N)',
          data: telemetryLog.map(d => d.gravity),
          borderColor: '#475569',
          borderWidth: 1,
          borderDash: [5, 5],
          fill: false
        }
      ];
      telemetryChart.options.plugins.legend.display = true;
    }

    telemetryChart.data.datasets = dataset;
    telemetryChart.options.scales.y.title.text = yTitle;
    telemetryChart.update('none'); // Update without full layout recalculations for speed
  }

  // Chart Tab Event Handlers
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeChartTab = e.target.getAttribute('data-chart');
      updateChartData();
    });
  });

  // --- Initial System Boot ---
  applyRocketPresetForMotor(dropdownMotor.value);
  updateCalculatedSpecs();
  resetSimulation();

  // Draw initial canvas frame static state
  setTimeout(() => {
    sim.render(rocketState, rocketConfig, 0);
  }, 100);
});
