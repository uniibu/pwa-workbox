exports.fixUrl = url => url.replace(/\/\//g, '/').replace(':/', '://');
exports.isUrl = url => url.indexOf('http') === 0 || url.indexOf('//') === 0;
exports.pick = function pick(obj, keys) {
  return keys.map(k => k in obj ? {
    [k]: obj[k]
  } : {})
    .reduce((res, o) => Object.assign(res, o), {});
};