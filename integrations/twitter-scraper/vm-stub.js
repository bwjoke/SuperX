// This integration never runs password login or remote JS instrumentation.
export function runInNewContext(){throw new Error('Password login is disabled in the SuperX browser adapter.');}
