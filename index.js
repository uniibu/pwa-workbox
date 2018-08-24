const path = require('path');
const swBuild = require('workbox-build');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const hashSum = require('hash-sum');
const debug = require('debug')('nuxt:pwa');
const mixin = require('mixin-deep');
const helpers = require('./helpers');
// =============================================
// workboxModule
// =============================================
module.exports = function nuxtWorkbox(moduleOptions) {
  if (this.options.dev) {
    return;
  }
  const hook = () => {
    debug('Adding workbox');
    const options = getOptions.call(this, moduleOptions);
    workboxInject.call(this, options);
    setHeaders.call(this, options);
    emitAssets.call(this, options);
    addTemplates.call(this, options);
  };
  this.nuxt.hook ? this.nuxt.hook('build:before', hook) : this.nuxt.plugin('build', hook);
};
// =============================================
// getRouterBase
// =============================================
function loadScriptExtension(scriptExtension) {
  if (scriptExtension) {
    const extPath = this.nuxt.resolveAlias(scriptExtension);
    if (existsSync(extPath)) {
      return readFileSync(extPath, 'utf8');
    }
    return null;
  }
}
// Check the correct path of the build files
// Due to changes here https://github.com/nuxt/nuxt.js/pull/3758
function getBuildDir() {
  let buildDir = path.resolve(this.options.buildDir, 'dist', 'client');
  if (!existsSync(buildDir)) {
    // for backwards compatibility
    buildDir = path.resolve(this.options.buildDir, 'dist');
  }
  return buildDir;
}

function getOptions(moduleOptions) {
  // Router Base
  const routerBase = this.options.router.base;
  let publicPath = helpers.fixUrl(`${routerBase}/${this.options.build.publicPath}`);
  debug('fixedUrl piublicPath %s', publicPath);
  if (helpers.isUrl(this.options.build.publicPath)) {
    publicPath = this.options.build.publicPath;
    if (publicPath.indexOf('//') === 0) {
      publicPath = `/${publicPath}`;
      debug('escaped piublicPath %s', publicPath);
    }
  }
  const defaults = {
    autoRegister: true,
    routerBase,
    publicPath,
    swSrc: path.resolve(this.options.buildDir, 'sw.template.js'),
    swDest: path.resolve(this.options.srcDir, this.options.dir.static || 'static', 'sw.js'),
    directoryIndex: '/',
    cachingExtensions: null,
    routingExtensions: null,
    cacheId: process.env.npm_package_name || 'nuxt',
    clientsClaim: true,
    skipWaiting: true,
    globPatterns: ['**/*.{js,css}'],
    globDirectory: getBuildDir(),
    modifyUrlPrefix: {
      '': helpers.fixUrl(publicPath)
    },
    offline: true,
    offlinePage: null,
    _runtimeCaching: [
      // Cache all _nuxt resources at runtime
      // They are hashed by webpack so are safe to loaded by cacheFirst handler
      {
        urlPattern: helpers.fixUrl(`${publicPath}/.*`),
        handler: 'cacheFirst'
      }],
    runtimeCaching: []
  };

  const options = mixin({}, defaults, moduleOptions, this.options.workbox );
  // Optionally cache other routes for offline
  if (options.offline && !options.offlinePage) {
    options._runtimeCaching.push({
      urlPattern: helpers.fixUrl(`${routerBase}/.*`),
      handler: 'networkFirst'
    });
  }
  if (options.cachingExtensions) {
    options.cachingExtensions = loadScriptExtension.call(this, options.cachingExtensions);
  }
  if (options.routingExtensions) {
    options.routingExtensions = loadScriptExtension.call(this, options.routingExtensions);
  }
  return options;
}
// =============================================
// addTemplates
// =============================================
function addTemplates(options) {
  // Add sw.template.js
  this.addTemplate({
    src: path.resolve(__dirname, 'templates/sw.template.js'),
    fileName: 'sw.template.js',
    options: {
      offlinePage: options.offlinePage,
      cachingExtensions: options.cachingExtensions,
      routingExtensions: options.routingExtensions,
      importScripts: [options.wbDst].concat(options.importScripts || []),
      runtimeCaching: [].concat(options._runtimeCaching, options.runtimeCaching).map(i => (Object.assign({}, i, {
        urlPattern: i.urlPattern,
        handler: i.handler || 'networkFirst',
        method: i.method || 'GET'
      }))),
      clientsClaim: options.clientsClaim,
      skipWaiting: options.skipWaiting,
      wbOptions: {
        cacheId: options.cacheId,
        directoryIndex: options.directoryIndex,
        cleanUrls: false
      }
    }
  });
  // Add sw.plugin.js
  if (options.autoRegister) {
    const swURL = `${options.routerBase}/${options.swURL || 'sw.js'}`;
    this.addPlugin({
      src: path.resolve(__dirname, 'templates/sw.plugin.js'),
      ssr: false,
      fileName: 'sw.plugin.js',
      options: {
        swURL: helpers.fixUrl(swURL),
        swScope: helpers.fixUrl(`${options.routerBase}/`)
      }
    });
  }
}
// =============================================
// emitAssets
// =============================================
function emitAssets(options) {
  const assets = [];
  const emitAsset = (path, name, ext = 'js') => {
    const source = readFileSync(path);
    const hash = hashSum(source);
    const dst = `${name}.${hash}.${ext}`;
    assets.push({ source, dst });
    return dst;
  };
  // Write assets after build
  const hook = () => {
    assets.forEach(({ source, dst }) => {
      writeFileSync(path.resolve(getBuildDir(), dst), source, 'utf-8');
    });
  };
  if (this.nuxt.hook) {
    this.nuxt.hook('build:done', hook);
  } else {
    this.nuxt.plugin('build', builder => {
      builder.plugin('built', hook);
    });
  }
  // workbox.js
  let wbPath = require.resolve('workbox-sw');
  if (options.dev) {
    wbPath = wbPath.replace(/prod/g, 'dev');
  }
  options.wbDst = helpers.fixUrl(`${options.publicPath}/${emitAsset(wbPath, `workbox${options.dev ? '.dev' : ''}`)}`);
}
// =============================================
// workboxInject
// =============================================
function workboxInject(options) {
  const hook = () => {
    const opts = helpers.pick(options, ['swDest', 'swSrc', 'globDirectory', 'globFollow', 'globIgnores', 'globPatterns', 'dontCacheBustUrlsMatching', 'globStrict', 'templatedUrls', 'maximumFileSizeToCacheInBytes', 'modifyUrlPrefix', 'manifestTransforms']);
    return swBuild.injectManifest(opts);
  };
  if (this.nuxt.hook) {
    this.nuxt.hook('build:done', hook);
  } else {
    this.nuxt.plugin('build', builder => {
      builder.plugin('built', hook);
    });
  }
}
// =============================================
// setHeaders
// =============================================
function setHeaders(options) {
  if (options.customHeaders) {
    return;
  }
  const originalSetHeadersMethod = this.options.render.static.setHeaders;
  this.options.render.static.setHeaders = (res, path) => {
    if (path.match(/sw\.js$/)) {
      // Prevent caching service worker
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      if (typeof originalSetHeadersMethod !== 'undefined') {
        originalSetHeadersMethod(res, path);
      }
    }
  };
}
module.exports.meta = require('./package.json');