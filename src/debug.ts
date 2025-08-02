let isVerbose = false;

export function setVerbose(verbose: boolean) {
	isVerbose = verbose;
}

export function createDebugLogger(functionName: string) {
	return (message: string) => {
		if (isVerbose) {
			console.debug(`[${functionName}] ${message}`);
		}
	};
}
