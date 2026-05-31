const app = document.querySelector(".app-shell");
const powerButton = document.querySelector("#powerButton");
const modeButtons = document.querySelectorAll(".mode-button");
const tempRange = document.querySelector("#tempRange");
const fanRange = document.querySelector("#fanRange");
const tempDown = document.querySelector("#tempDown");
const tempUp = document.querySelector("#tempUp");
const displayMode = document.querySelector("#displayMode");
const displayTemp = document.querySelector("#displayTemp");
const panelTemp = document.querySelector("#panelTemp");
const runningAudio = document.querySelector("#runningAudio");

const modeLabels = {
  cool: "制冷",
  heat: "制热",
  dry: "除湿",
  fan: "送风",
  auto: "自动",
};

const RUNNING_LOOP_START = 4;
const LOOP_GUARD_SECONDS = 0.18;
const runningVolumes = {
  1: 0.018,
  2: 0.03,
  3: 0.045,
};

let audioContext;
let masterGain;
let compressor;
let isPowerOn = false;
let currentMode = "cool";
let currentTemp = Number(tempRange.value);
let currentFan = Number(fanRange.value);
let hasPlayedSound = false;
let runningFadeFrame = null;
let runningStopTimer = null;
let runningLoopReady = false;
let isSeekingLoop = false;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioContext.createGain();
    compressor = audioContext.createDynamicsCompressor();
    masterGain.gain.setValueAtTime(0, audioContext.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.22, audioContext.currentTime + 0.45);
    compressor.threshold.setValueAtTime(-28, audioContext.currentTime);
    compressor.knee.setValueAtTime(18, audioContext.currentTime);
    compressor.ratio.setValueAtTime(10, audioContext.currentTime);
    compressor.attack.setValueAtTime(0.006, audioContext.currentTime);
    compressor.release.setValueAtTime(0.16, audioContext.currentTime);
    masterGain.connect(compressor);
    compressor.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function getSafeStartTime(delay = 0) {
  const context = getAudioContext();
  return context.currentTime + delay;
}

function playTone(frequency, startTime, duration, volume = 0.045, type = "sine") {
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function vibrate(pattern = 18) {
  if ("vibrate" in navigator) {
    navigator.vibrate(0);
    navigator.vibrate(pattern);
  }
}

function bindPressVibration(element, pattern = 24) {
  if (!element) {
    return;
  }

  element.addEventListener("pointerdown", () => {
    vibrate(pattern);
  });
}

function setRunningVolume(target, rampMs = 280) {
  if (!runningAudio) {
    return;
  }

  if (runningFadeFrame) {
    cancelAnimationFrame(runningFadeFrame);
    runningFadeFrame = null;
  }

  const start = runningAudio.volume;
  const end = Math.max(0, Math.min(0.08, target));
  const startedAt = performance.now();

  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / rampMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    runningAudio.volume = start + (end - start) * eased;
    if (progress < 1) {
      runningFadeFrame = requestAnimationFrame(tick);
    } else {
      runningFadeFrame = null;
    }
  };

  runningFadeFrame = requestAnimationFrame(tick);
}

function getRunningPlaybackRate() {
  return currentFan === 1 ? 0.96 : currentFan === 2 ? 1 : 1.045;
}

function updateRunningAudio(rampMs = 240) {
  if (!runningAudio || runningAudio.paused) {
    return;
  }

  runningAudio.playbackRate = getRunningPlaybackRate();
  setRunningVolume(runningVolumes[currentFan], rampMs);
}

async function startRunningSound(isStartup = false) {
  if (!runningAudio) {
    return;
  }

  if (runningStopTimer) {
    clearTimeout(runningStopTimer);
    runningStopTimer = null;
  }

  if (isStartup) {
    runningAudio.currentTime = 0;
    runningLoopReady = false;
  } else if (runningAudio.paused && runningLoopReady) {
    runningAudio.currentTime = RUNNING_LOOP_START;
  }

  runningAudio.loop = false;
  runningAudio.playbackRate = getRunningPlaybackRate();
  if (runningAudio.paused || isStartup) {
    runningAudio.volume = 0;
  }

  try {
    await runningAudio.play();
    setRunningVolume(runningVolumes[currentFan], isStartup ? 1200 : 240);
  } catch {
    runningAudio.volume = 0;
  }
}

function stopRunningSound() {
  if (!runningAudio) {
    return;
  }

  setRunningVolume(0, 900);
  if (runningStopTimer) {
    clearTimeout(runningStopTimer);
  }
  runningStopTimer = setTimeout(() => {
    runningAudio.pause();
    runningAudio.volume = 0;
    runningLoopReady = false;
    runningStopTimer = null;
  }, 960);
}

function playPowerBeep(volumeScale = 1) {
  const now = getSafeStartTime();
  const volume = 0.065 * volumeScale;

  playTone(1040, now, 0.09, volume, "sine");
  playTone(1560, now + 0.01, 0.035, volume * 0.28, "triangle");
}

function playButtonClick(strength = 1) {
  const now = getSafeStartTime();
  const volume = 0.048 * strength;

  playTone(740, now, 0.04, volume, "sine");
}

function playSound(type) {
  const firstSound = !hasPlayedSound;
  hasPlayedSound = true;

  if (type === "power-on") {
    playPowerBeep(firstSound ? 0.55 : 1);
    startRunningSound(true);
    return;
  }

  if (type === "power-off") {
    playPowerBeep(firstSound ? 0.55 : 1);
    stopRunningSound();
    return;
  }

  if (type === "mode") {
    const now = getSafeStartTime();
    playTone(620, now, 0.045, 0.056, "sine");
    playTone(920, now + 0.045, 0.055, 0.052, "sine");
    return;
  }

  if (type === "fan") {
    const now = getSafeStartTime();
    const base = 520 + currentFan * 90;
    playTone(base, now, 0.045, 0.052, "sine");
    playTone(base + 130, now + 0.045, 0.05, 0.048, "sine");
    if (isPowerOn) {
      updateRunningAudio(320);
    }
    return;
  }

  playButtonClick();
}

function updateUi() {
  app.dataset.power = isPowerOn ? "on" : "off";
  app.dataset.mode = currentMode;
  app.dataset.fan = String(currentFan);
  powerButton.setAttribute("aria-pressed", String(isPowerOn));

  displayMode.textContent = isPowerOn ? modeLabels[currentMode] : "待机";
  displayTemp.textContent = currentTemp;
  panelTemp.textContent = currentTemp;

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === currentMode);
  });
}

function setTemperature(value) {
  currentTemp = Math.min(30, Math.max(16, value));
  tempRange.value = currentTemp;
  updateUi();
}

function setFan(value) {
  currentFan = Math.min(3, Math.max(1, value));
  fanRange.value = currentFan;
  if (!isPowerOn) {
    isPowerOn = true;
    startRunningSound(true);
  } else {
    updateRunningAudio(320);
  }
  updateUi();
}

powerButton.addEventListener("click", () => {
  isPowerOn = !isPowerOn;
  playSound(isPowerOn ? "power-on" : "power-off");
  updateUi();
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const isModeChanged = currentMode !== button.dataset.mode;
    currentMode = button.dataset.mode;
    isPowerOn = true;
    startRunningSound(!runningAudio || runningAudio.paused);
    playSound(isModeChanged ? "mode" : "tap");
    updateUi();
  });
});

tempRange.addEventListener("input", (event) => {
  playSound("tap");
  setTemperature(Number(event.target.value));
});

fanRange.addEventListener("input", (event) => {
  setFan(Number(event.target.value));
  playSound("fan");
});

tempDown.addEventListener("click", () => {
  playSound("tap");
  setTemperature(currentTemp - 1);
});

tempUp.addEventListener("click", () => {
  playSound("tap");
  setTemperature(currentTemp + 1);
});

bindPressVibration(powerButton, [35, 20, 45]);
bindPressVibration(tempDown, 28);
bindPressVibration(tempUp, 28);
bindPressVibration(tempRange, 18);
bindPressVibration(fanRange, [22, 12, 28]);
modeButtons.forEach((button) => {
  bindPressVibration(button, [24, 14, 24]);
});

if (runningAudio) {
  runningAudio.addEventListener("timeupdate", () => {
    if (runningAudio.currentTime >= RUNNING_LOOP_START) {
      runningLoopReady = true;
    }

    if (
      isPowerOn &&
      runningLoopReady &&
      Number.isFinite(runningAudio.duration) &&
      runningAudio.duration > RUNNING_LOOP_START + LOOP_GUARD_SECONDS &&
      runningAudio.currentTime >= runningAudio.duration - LOOP_GUARD_SECONDS &&
      !isSeekingLoop
    ) {
      isSeekingLoop = true;
      runningAudio.currentTime = RUNNING_LOOP_START;
      setTimeout(() => {
        isSeekingLoop = false;
      }, 80);
    }
  });

  runningAudio.addEventListener("ended", () => {
    if (!isPowerOn) {
      return;
    }

    runningAudio.currentTime = RUNNING_LOOP_START;
    isSeekingLoop = false;
    runningAudio.play().catch(() => {
      runningAudio.volume = 0;
    });
  });
}

updateUi();
