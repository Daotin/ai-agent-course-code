import chalk from "chalk";

const colors = {
  info: "green",
  error: "red",
  warn: "yellow",
  success: "green",

  blue: "blue",
  magenta: "magenta",
  cyan: "cyan",
  white: "white",
  gray: "gray",
  black: "black",
  redBright: "redBright",
  greenBright: "greenBright",
  yellowBright: "yellowBright",
  blueBright: "blueBright",
  magentaBright: "magentaBright",
  cyanBright: "cyanBright",
  whiteBright: "whiteBright",
  grayBright: "grayBright",
  blackBright: "blackBright",
};

function _log(message, type = "info") {
  const color = colors[type];
  console.log(chalk[color](message));
}

export const log = Object.fromEntries(
  Object.keys(colors).map((type) => [type, (message) => _log(message, type)]),
);
