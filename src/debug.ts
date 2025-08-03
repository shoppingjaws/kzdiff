let verboseEnabled = false;

export function setVerbose(enabled: boolean) {
	verboseEnabled = enabled;
}

export function createDebugLogger(functionName: string) {
	return (message: string) => {
		if (verboseEnabled) {
			console.debug(`[${functionName}] ${message}`);
		}
	};
}
