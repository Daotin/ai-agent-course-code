import chalk from 'chalk'

const colors = {
	info: 'green',
	error: 'red',
	warn: 'yellow',
	success: 'green',

	blue: 'blue',
	magenta: 'magenta',
	cyan: 'cyan',
	white: 'white',
	gray: 'gray',
	black: 'black',
	redBright: 'redBright',
	greenBright: 'greenBright',
	yellowBright: 'yellowBright',
	blueBright: 'blueBright',
	magentaBright: 'magentaBright',
	cyanBright: 'cyanBright',
	whiteBright: 'whiteBright',
	grayBright: 'grayBright',
	blackBright: 'blackBright',
	// 背景色
	bgBlack: 'bgBlack',
	bgRed: 'bgRed',
	bgGreen: 'bgGreen',
	bgYellow: 'bgYellow',
	bgBlue: 'bgBlue',
	bgMagenta: 'bgMagenta',
	bgCyan: 'bgCyan',
	bgWhite: 'bgWhite',
	bgGray: 'bgGray',
	bgBlackBright: 'bgBlackBright',
	bgRedBright: 'bgRedBright',
	bgGreenBright: 'bgGreenBright',
	bgYellowBright: 'bgYellowBright',
	bgBlueBright: 'bgBlueBright',
	bgMagentaBright: 'bgMagentaBright',
	bgCyanBright: 'bgCyanBright',
	bgWhiteBright: 'bgWhiteBright',
	bgGrayBright: 'bgGrayBright',
	bgBlackBright: 'bgBlackBright',
	bgRedBright: 'bgRedBright',
	bgGreenBright: 'bgGreenBright',
	bgYellowBright: 'bgYellowBright',
	bgBlueBright: 'bgBlueBright',
	bgMagentaBright: 'bgMagentaBright',
	bgCyanBright: 'bgCyanBright',
	bgWhiteBright: 'bgWhiteBright',
	bgGrayBright: 'bgGrayBright',
}

function _log(message, type = 'info') {
	const color = colors[type]
	console.log(chalk[color](message))
}

export const log = Object.fromEntries(Object.keys(colors).map(type => [type, message => _log(message, type)]))

export function formatToolOutput(output) {
	if (typeof output === 'string') {
		return output
	} else if (output && output.text) {
		return output.text
	}
	return JSON.stringify(output)
}
