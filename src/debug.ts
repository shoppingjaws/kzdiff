export function createDebugLogger(functionName: string) {
	return (message: string) => console.debug(`[${functionName}] ${message}`);
}
