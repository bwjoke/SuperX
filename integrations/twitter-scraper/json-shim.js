// Native JSON avoids the legacy dependency's eval-based parser in MV3.
export const parse=JSON.parse;
export const stringify=JSON.stringify;
export default {parse,stringify};
