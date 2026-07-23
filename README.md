Markdown
# AeroVanguard: High-Fidelity Model Rocket Flight Dynamics Simulator

**AeroVanguard** is a browser-based, interactive flight dynamics simulator designed to model the powered ascent, ballistic coast, and recovery phases of high-power model rockets[cite: 1, 3]. Built with a physics engine utilizing numerical integration, the simulator evaluates the aerodynamic, thermodynamic, and mechanical trade-offs inherent in rocketry design[cite: 1].

---

## 🚀 Key Features

* **US Standard Atmosphere Model**: Dynamically computes temperature lapse rates and atmospheric density ($\rho$) across the troposphere and lower stratosphere[cite: 1].
* **Aerodynamic Drag Estimation ($C_d$)**:
  * **Nose Cones**: Form factor evaluations for Conical, Ogive, Parabolic, and minimum-drag von Kármán (Haack series) geometries[cite: 1].
  * **Fin Configurations**: Drag additions calculated for Swept, Trapezoidal, Elliptical, and Hexagonal profiles[cite: 1].
  * **Fuselage & Materials**: Skin friction scaling based on length-to-diameter aspect ratios and material surface roughness (Cardboard, Plastic, Fiberglass, Carbon Fiber)[cite: 1].
* **Transient Thrust Profiles**: Accurate 4-phase motor thrust curves (Ignition spike, Post-spike stabilization, Sustained burn, Decaying burn out) built on standard Estes impulse classes (`A8-3` to `D12-5`) and custom motor configurations[cite: 1].
* **Numerical Integration**: Employs an Euler-Cromer integration scheme to update state variables (position, velocity, acceleration) in real time[cite: 1].
* **Real-time Telemetry & Visualization**:
  * Dual-layer rendering system featuring dynamic visual effects, particle exhaust streams, and sound synthesis via the Web Audio API[cite: 3].
  * Interactive charting for tracking altitude, velocity, acceleration (G-Force), and net dynamic forces ($F_{thrust}, F_{drag}, F_{gravity}$)[cite: 1, 6].

---

## 🛠️ Governing Physics & Mathematical Formulation

### 1. Atmospheric Density Model
Air density ($\rho$) as a function of altitude ($h$) is determined via the US Standard Atmosphere (Troposphere approximation for $h < 11{,}000\text{ m}$)[cite: 1]:

$$\rho = \rho_0 \left(1 - \frac{L \cdot h}{T_0}\right)^{\frac{g}{R \cdot L} - 1}$$

Where:
* $\rho_0 = 1.225 \text{ kg/m}^3$ (Sea-level density)[cite: 1]
* $L = 0.0065 \text{ K/m}$ (Temperature lapse rate)[cite: 1]
* $T_0 = 288.15 \text{ K}$ (Sea-level temperature)[cite: 1]
* $g = 9.80665 \text{ m/s}^2$ (Gravitational acceleration)[cite: 1]
* $R = 287.05 \text{ J/(kg}\cdot\text{K)}$ (Specific gas constant for dry air)[cite: 1]

---

### 2. Equations of Motion
Summing dynamic forces acting along the longitudinal axis yields net acceleration ($a$)[cite: 1]:

$$\sum F = F_{\text{Thrust}} + F_{\text{Drag}} + F_{\text{Gravity}} = m(t) \cdot a$$

$$F_{\text{Drag}} = -\frac{1}{2} \cdot \rho(h) \cdot v \cdot \vert{}v\vert{} \cdot C_d \cdot A$$

$$F_{\text{Gravity}} = -m(t) \cdot g$$

Where $A$ is the cross-sectional reference area, $C_d$ is the total drag coefficient, and $m(t)$ is the time-varying mass as propellant depletes during the motor burn phase[cite: 1].

---

## 📂 Repository Structure

```text
├── index.html        # Main dashboard interface and telemetry HUD layout
├── style.css         # Custom Aerospace Command UI styling and responsive layouts[cite: 4]
├── physics.js        # Core atmospheric, aerodynamic, motor, and integration engine[cite: 1]
├── simulation.js     # Canvas renderer, parallax scrolling environment, and audio synthesis[cite: 3]
├── app.js            # Main application controller, UI event hooks, and Chart.js integration
└── serve.ps1         # Lightweight PowerShell HTTP server script for local execution
