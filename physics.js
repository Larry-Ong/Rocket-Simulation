/**
 * Physics module for Model Rocket Simulation
 */

// Materials data: densities in g/cm^3
const MATERIALS = {
  cardboard: { name: 'Cardboard', density: 0.15, CdFactor: 1.1 },
  plastic: { name: 'Plastic', density: 0.95, CdFactor: 0.9 },
  fiberglass: { name: 'Fiberglass', density: 1.80, CdFactor: 0.7 },
  carbonfiber: { name: 'Carbon Fiber', density: 1.60, CdFactor: 0.6 }
};

// Nose cone Cd presets
const NOSE_CONES = {
  conical: { name: 'Conical', Cd: 0.35 },
  ogive: { name: 'Ogive', Cd: 0.25 },
  parabolic: { name: 'Parabolic', Cd: 0.20 },
  haack: { name: 'von Kármán (Haack)', Cd: 0.18 }
};

// Fin Cd additions
const FINS = {
  swept: { name: 'Swept', CdBase: 0.04 },
  trapezoidal: { name: 'Trapezoidal', CdBase: 0.03 },
  elliptical: { name: 'Elliptical', CdBase: 0.02 },
  hexagonal: { name: 'Hexagonal', CdBase: 0.05 }
};

// Motor presets (Estes standards)
const MOTOR_PRESETS = {
  'A8-3': { name: 'Estes A8-3', burnTime: 0.5, totalImpulse: 2.5, avgThrust: 5.0, maxThrust: 12.0, propellantMass: 0.0031, motorMass: 0.0162, delay: 3.0 },
  'B6-4': { name: 'Estes B6-4', burnTime: 0.8, totalImpulse: 5.0, avgThrust: 6.2, maxThrust: 12.1, propellantMass: 0.0056, motorMass: 0.0201, delay: 4.0 },
  'C6-5': { name: 'Estes C6-5', burnTime: 1.6, totalImpulse: 10.0, avgThrust: 6.2, maxThrust: 14.1, propellantMass: 0.0108, motorMass: 0.0269, delay: 5.0 },
  'D12-5': { name: 'Estes D12-5', burnTime: 1.7, totalImpulse: 20.0, avgThrust: 11.8, maxThrust: 29.7, propellantMass: 0.0249, motorMass: 0.0428, delay: 5.0 },
  'icbm': { name: 'icbm motor', burnTime: 1.5, totalImpulse: 1185.0, avgThrust: 790.0, maxThrust: 800.0, propellantMass: 0.350, motorMass: 0.600, delay: 5.0 },
  'custom': { name: 'Custom Motor', burnTime: 1.5, totalImpulse: 15.0, avgThrust: 10.0, maxThrust: 20.0, propellantMass: 0.0180, motorMass: 0.0350, delay: 4.0 }
};

/**
 * Calculates current air density (kg/m^3) at a given altitude (m)
 * using the US Standard Atmosphere model for the troposphere.
 */
function getAirDensity(altitude) {
  if (altitude < 0) altitude = 0;
  const p0 = 1.225; // Sea level density (kg/m^3)
  const L = 0.0065; // Temperature lapse rate (K/m)
  const T0 = 288.15; // Sea level temperature (K)
  const g = 9.80665; // Gravity (m/s^2)
  const R = 287.05; // Gas constant for dry air (J/kg*K)

  if (altitude < 11000) {
    return p0 * Math.pow(1 - (L * altitude) / T0, (g / (R * L)) - 1);
  } else {
    // Stratosphere approximation
    const p11 = 0.36391;
    const T11 = 216.65;
    return p11 * Math.exp(-g * (altitude - 11000) / (R * T11));
  }
}

/**
 * Calculates empty mass of the rocket structure in kg
 */
function calculateEmptyMass(config) {
  // Config parameters:
  // bodyLength (cm), bodyDiameter (mm), bodyMaterial ('cardboard', etc.),
  // noseType ('conical', etc.), noseLength (cm),
  // finType ('swept', etc.), finCount (3, 4, 6), finSpan (cm),
  // parachuteDiameter (cm), wallThickness (mm)

  const material = MATERIALS[config.bodyMaterial] || MATERIALS.cardboard;
  const density = material.density; // g/cm^3

  // 1. Fuselage tube: wall thickness from config (converted to cm)
  const thicknessCm = config.wallThickness / 10;
  const r_outer = (config.bodyDiameter / 10) / 2; // cm
  const r_inner = Math.max(0.01, r_outer - thicknessCm);
  const tubeVolume = Math.PI * (r_outer * r_outer - r_inner * r_inner) * config.bodyLength; // cm^3
  const bodyMass = tubeVolume * density; // grams

  // 2. Nose cone: hollow shell, approx 1mm thick (0.1cm)
  const noseVolume = Math.PI * r_outer * r_outer * config.noseLength * 0.33 * 0.1; // cm^3 approximation
  const noseMass = noseVolume * density; // grams

  // 3. Fins: assumed thickness of 2mm (0.2cm)
  // Fin area approximated as a triangle: 0.5 * height (finSpan) * length (approx 4cm)
  const finArea = 0.5 * config.finSpan * 4; // cm^2
  const finVolume = finArea * 0.2 * config.finCount; // cm^3
  const finMass = finVolume * density; // grams

  // 4. Parachute and recovery: nylon parachute density + shroud lines
  // Nylon fabric density approx 0.007 g/cm^2
  const parachuteArea = Math.PI * Math.pow(config.parachuteDiameter / 2, 2); // cm^2
  const parachuteMass = (parachuteArea * 0.007) + 5.0; // 5g lines/swivel base

  // 5. Glue, paint, launch lug, shock cord base
  const miscMass = 10.0; // grams

  // Total empty mass in kg
  return (bodyMass + noseMass + finMass + parachuteMass + miscMass) / 1000;
}

/**
 * Calculates current rocket drag coefficient Cd based on configuration
 */
function calculateDragCoefficient(config) {
  const material = MATERIALS[config.bodyMaterial] || MATERIALS.cardboard;
  const nose = NOSE_CONES[config.noseType] || NOSE_CONES.ogive;
  const fin = FINS[config.finType] || FINS.swept;

  // Base Cd is nose cone Cd
  let Cd = nose.Cd;

  // Add fin drag contribution
  Cd += fin.CdBase * (config.finCount / 4);

  // Add skin friction estimation based on length-to-diameter ratio
  const aspect = config.bodyLength / (config.bodyDiameter / 10);
  Cd += aspect * 0.005;

  // Multiply by material roughness factor
  Cd *= material.CdFactor;

  return Cd;
}

/**
 * Returns engine thrust (Newtons) at a given elapsed time (seconds)
 */
function getMotorThrust(motorConfig, t) {
  if (t < 0 || t > motorConfig.burnTime) return 0;
  
  // Normalised burn time
  const nt = t / motorConfig.burnTime;

  // Modern thrust profile curve
  if (nt < 0.12) {
    // Ignition spike: ramp up to max thrust
    return (nt / 0.12) * motorConfig.maxThrust;
  } else if (nt < 0.25) {
    // Post-ignition spike drop to average/sustaining thrust
    const ratio = (nt - 0.12) / 0.13;
    return motorConfig.maxThrust - ratio * (motorConfig.maxThrust - motorConfig.avgThrust);
  } else if (nt < 0.90) {
    // Sustained thrust
    return motorConfig.avgThrust;
  } else {
    // Thrust decay to zero
    const ratio = (nt - 0.90) / 0.10;
    return motorConfig.avgThrust * (1 - ratio);
  }
}

/**
 * Solves one step of flight dynamics using Euler-Cromer integration.
 * Since dt is small (e.g. 0.016s for 60fps), Euler-Cromer is highly stable and precise.
 */
function updatePhysicsStep(state, config, dt) {
  if (state.phase === 'ready') {
    state.time = 0;
    state.altitude = 0;
    state.velocity = 0;
    state.acceleration = 0;
    state.propellantMass = config.motor.propellantMass;
    state.totalMass = state.emptyMass + config.motor.motorMass;
    state.maxAltitude = 0;
    state.maxVelocity = 0;
    state.maxAcceleration = 0;
    state.thrustForce = 0;
    state.dragForce = 0;
    state.gravityForce = 0;
    state.parachuteDeployed = false;
    state.burnTimeElapsed = 0;
    return state;
  }

  if (state.phase === 'landed') {
    state.velocity = 0;
    state.acceleration = 0;
    state.thrustForce = 0;
    state.dragForce = 0;
    state.gravityForce = 0;
    return state;
  }

  // 1. Update timers
  state.time += dt;

  // 2. Compute masses
  let currentPropellantMass = state.propellantMass;
  let activeThrust = 0;

  if (state.phase === 'thrust') {
    state.burnTimeElapsed += dt;
    if (state.burnTimeElapsed >= config.motor.burnTime) {
      state.phase = 'coast';
      currentPropellantMass = 0;
      activeThrust = 0;
    } else {
      activeThrust = getMotorThrust(config.motor, state.burnTimeElapsed);
      // Consume propellant linearly during burn
      currentPropellantMass = config.motor.propellantMass * (1 - state.burnTimeElapsed / config.motor.burnTime);
      if (currentPropellantMass < 0) currentPropellantMass = 0;
    }
  }

  state.propellantMass = currentPropellantMass;
  // Total mass = empty mass + motor casing (total - propellant) + current propellant
  const casingMass = config.motor.motorMass - config.motor.propellantMass;
  state.totalMass = state.emptyMass + casingMass + state.propellantMass;

  // 3. Environmental variables
  const g = 9.80665; // m/s^2
  const rho = getAirDensity(state.altitude);

  // 4. Aerodynamic Drag
  let drag = 0;
  let area = 0;
  let Cd = 0;

  // Check parachute ejection conditions
  const timeSinceBurnEnd = state.time - config.motor.burnTime;
  const isEjectionDelayReached = state.phase === 'coast' && timeSinceBurnEnd >= config.motor.delay;
  const isApogeeReached = state.velocity <= 0 && state.phase === 'coast';

  // Support smart ejection or delay charge
  let triggerParachute = false;
  if (config.smartEjection) {
    triggerParachute = isApogeeReached;
  } else {
    triggerParachute = isEjectionDelayReached || isApogeeReached; // Fail-safe
  }

  if (triggerParachute && !state.parachuteDeployed && state.altitude > 2) {
    state.parachuteDeployed = true;
    state.phase = 'parachute';
  }

  if (state.parachuteDeployed) {
    // Parachute drag
    Cd = 1.5; // Drag coeff of parachute dome
    area = Math.PI * Math.pow((config.parachuteDiameter / 100) / 2, 2); // m^2 (input in cm)
  } else {
    // Rocket drag
    Cd = state.dragCoefficient;
    area = Math.PI * Math.pow((config.bodyDiameter / 1000) / 2, 2); // m^2 (input in mm)
  }

  // Drag formula: Fd = 0.5 * rho * v^2 * Cd * Area
  const velSign = state.velocity >= 0 ? 1 : -1;
  drag = 0.5 * rho * state.velocity * state.velocity * Cd * area;
  const dragForceVector = -velSign * drag;

  // 5. Gravity Force
  const gravityForceVector = -state.totalMass * g;

  // 6. Net Force and Acceleration
  const thrustForceVector = activeThrust;
  const netForce = thrustForceVector + dragForceVector + gravityForceVector;
  
  // Acceleration
  let acc = netForce / state.totalMass;

  // If rocket is on the launch pad (rail), it cannot go downwards
  if (state.altitude <= 0 && state.velocity <= 0) {
    state.altitude = 0;
    if (thrustForceVector > Math.abs(gravityForceVector)) {
      // Launch!
      state.phase = 'thrust';
      acc = (thrustForceVector + gravityForceVector) / state.totalMass;
    } else {
      state.velocity = 0;
      acc = 0;
      if (state.phase !== 'thrust' && state.phase !== 'coast') {
        state.phase = 'ready';
      }
    }
  }

  // 7. Integrate (Euler-Cromer)
  state.velocity += acc * dt;
  state.altitude += state.velocity * dt;

  // 8. Collide with ground (Landing)
  if (state.altitude <= 0 && state.time > 0.1) {
    state.altitude = 0;
    state.velocity = 0;
    state.acceleration = 0;
    state.phase = 'landed';
  } else {
    state.acceleration = acc;
  }

  // 9. Statistics tracking
  if (state.altitude > state.maxAltitude) {
    state.maxAltitude = state.altitude;
  }
  if (state.velocity > state.maxVelocity) {
    state.maxVelocity = state.velocity;
  }
  const accG = state.acceleration / 9.80665;
  if (accG > state.maxAcceleration) {
    state.maxAcceleration = accG;
  }

  state.thrustForce = activeThrust;
  state.dragForce = drag;
  state.gravityForce = state.totalMass * g;

  return state;
}

// Export modules for web browser environment
window.RocketPhysics = {
  MATERIALS,
  NOSE_CONES,
  FINS,
  MOTOR_PRESETS,
  getAirDensity,
  calculateEmptyMass,
  calculateDragCoefficient,
  getMotorThrust,
  updatePhysicsStep
};
