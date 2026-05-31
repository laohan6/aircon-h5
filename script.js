const app = document.querySelector(".app-shell");
const powerButton = document.querySelector("#powerButton");
const modeButtons = document.querySelectorAll(".mode-button");
const tempRange = document.querySelector("#tempRange");
const tempDown = document.querySelector("#tempDown");
const tempUp = document.querySelector("#tempUp");
const displayMode = document.querySelector("#displayMode");
const displayTemp = document.querySelector("#displayTemp");
const panelTemp = document.querySelector("#panelTemp");
const stateText = document.querySelector("#stateText");

const modeLabels = {
  cool: "制冷",
  heat: "制热",
  dry: "除湿",
  fan: "送风",
  auto: "自动",
};

let isPowerOn = false;
let currentMode = "cool";
let currentTemp = Number(tempRange.value);

function updateUi() {
  app.dataset.power = isPowerOn ? "on" : "off";
  app.dataset.mode = currentMode;
  powerButton.setAttribute("aria-pressed", String(isPowerOn));

  displayMode.textContent = isPowerOn ? modeLabels[currentMode] : "待机";
  displayTemp.textContent = currentTemp;
  panelTemp.textContent = currentTemp;
  stateText.textContent = isPowerOn
    ? `${modeLabels[currentMode]}模式运行中`
    : "设备已关闭";

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === currentMode);
  });
}

function setTemperature(value) {
  currentTemp = Math.min(30, Math.max(16, value));
  tempRange.value = currentTemp;
  updateUi();
}

powerButton.addEventListener("click", () => {
  isPowerOn = !isPowerOn;
  updateUi();
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentMode = button.dataset.mode;
    isPowerOn = true;
    updateUi();
  });
});

tempRange.addEventListener("input", (event) => {
  setTemperature(Number(event.target.value));
});

tempDown.addEventListener("click", () => {
  setTemperature(currentTemp - 1);
});

tempUp.addEventListener("click", () => {
  setTemperature(currentTemp + 1);
});

updateUi();
