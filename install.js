// Copyright 2012 The Obvious Corporation.

/*
 * This simply fetches the right version of slimer for the current platform.
 */

'use strict'

var requestProgress = require('request-progress')
var progress = require('progress')
var AdmZip = require('adm-zip')
var cp = require('child_process')
var fs = require('fs-extra')
var hasha = require('hasha')
var helper = require('./lib/slimerjs')
var kew = require('kew')
var path = require('path')
var request = require('request')
var url = require('url')
var which = require('which')

var originalPath = process.env.PATH

// If the process exits without going through exit(), then we did not complete.
var validExit = false

process.on('exit', function () {
  if (!validExit) {
    console.log('Install exited unexpectedly')
    exit(1)
  }
})

// NPM adds bin directories to the path, which will cause `which` to find the
// bin for this package not the actual slimerjs bin.  Also help out people who
// put ./bin on their path
process.env.PATH = helper.cleanPath(originalPath)

var libPath = path.join(__dirname, 'lib')
var pkgPath = path.join(libPath, 'slimer')
var slimerPath = null

// If the user manually installed SlimerJS, we want
// to use the existing version.
//
// Do not re-use a manually-installed SlimerJS with
// a different version.
//
// Do not re-use an npm-installed SlimerJS, because
// that can lead to weird circular dependencies between
// local versions and global versions.
// https://github.com/Obvious/phantomjs/issues/85
// https://github.com/Medium/phantomjs/pull/184
kew.resolve(true)
  .then(trySlimerjsInLib)
  .then(trySlimerjsOnPath)
  .then(downloadSlimerjs)
  .then(extractDownload)
  .then(function (extractedPath) {
    return copyIntoPlace(extractedPath, pkgPath)
  })
  .then(function () {
    var location = getTargetPlatform() === 'win32' ?
        path.join(pkgPath, 'slimerjs.bat') :
        path.join(pkgPath, 'slimerjs')

    try {
      // Ensure executable is executable by all users
      fs.chmodSync(location, '755')
    } catch (err) {
      if (err.code == 'ENOENT') {
        console.error('chmod failed: slimerjs was not successfully copied to', location)
        exit(1)
      }
      throw err
    }

    var relativeLocation = path.relative(libPath, location)
    writeLocationFile(relativeLocation)

    console.log('Done. SlimerJS binary available at', location)
    exit(0)
  })
  .fail(function (err) {
    console.error('Slimer installation failed', err, err.stack)
    exit(1)
  })


function writeLocationFile(location) {
  console.log('Writing location.js file')
  if (getTargetPlatform() === 'win32') {
    location = location.replace(/\\/g, '\\\\')
  }

  var platform = getTargetPlatform()
  var arch = getTargetArch()

  var contents = 'module.exports.location = "' + location + '"\n'

  if (/^[a-zA-Z0-9]*$/.test(platform) && /^[a-zA-Z0-9]*$/.test(arch)) {
    contents +=
        'module.exports.platform = "' + getTargetPlatform() + '"\n' +
        'module.exports.arch = "' + getTargetArch() + '"\n'
  }

  fs.writeFileSync(path.join(libPath, 'location.js'), contents)
}

function exit(code) {
  validExit = true
  process.env.PATH = originalPath
  process.exit(code || 0)
}


function findSuitableTempDirectory() {
  var now = Date.now()
  var candidateTmpDirs = [
    process.env.TMPDIR || process.env.TEMP || process.env.npm_config_tmp,
    '/tmp',
    path.join(process.cwd(), 'tmp')
  ]

  for (var i = 0; i < candidateTmpDirs.length; i++) {
    var candidatePath = path.join(candidateTmpDirs[i], 'slimerjs')

    try {
      fs.mkdirsSync(candidatePath, '0777')
      // Make double sure we have 0777 permissions; some operating systems
      // default umask does not allow write by default.
      fs.chmodSync(candidatePath, '0777')
      var testFile = path.join(candidatePath, now + '.tmp')
      fs.writeFileSync(testFile, 'test')
      fs.unlinkSync(testFile)
      return candidatePath
    } catch (e) {
      console.log(candidatePath, 'is not writable:', e.message)
    }
  }

  console.error('Can not find a writable tmp directory, please report issue ' +
      'on https://github.com/graingert/slimerjs/issues with as much ' +
      'information as possible.')
  exit(1)
}


function getRequestOptions() {
  var strictSSL = !!process.env.npm_config_strict_ssl
  if (process.version == 'v0.10.34') {
    console.log('Node v0.10.34 detected, turning off strict ssl due to https://github.com/joyent/node/issues/8894')
    strictSSL = false
  }

  var options = {
    uri: getDownloadUrl(),
    encoding: null, // Get response as a buffer
    followRedirect: true, // The default download path redirects to a CDN URL.
    headers: {},
    strictSSL: strictSSL
  }

  var proxyUrl = process.env.npm_config_https_proxy ||
      process.env.npm_config_http_proxy ||
      process.env.npm_config_proxy
  if (proxyUrl) {

    // Print using proxy
    var proxy = url.parse(proxyUrl)
    if (proxy.auth) {
      // Mask password
      proxy.auth = proxy.auth.replace(/:.*$/, ':******')
    }
    console.log('Using proxy ' + url.format(proxy))

    // Enable proxy
    options.proxy = proxyUrl
  }

  // Use the user-agent string from the npm config
  options.headers['User-Agent'] = process.env.npm_config_user_agent

  // Use certificate authority settings from npm
  var ca = process.env.npm_config_ca
  if (!ca && process.env.npm_config_cafile) {
    try {
      ca = fs.readFileSync(process.env.npm_config_cafile, {encoding: 'utf8'})
        .split(/\n(?=-----BEGIN CERTIFICATE-----)/g)

      // Comments at the beginning of the file result in the first
      // item not containing a certificate - in this case the
      // download will fail
      if (ca.length > 0 && !/-----BEGIN CERTIFICATE-----/.test(ca[0])) {
        ca.shift()
      }

    } catch (e) {
      console.error('Could not read cafile', process.env.npm_config_cafile, e)
    }
  }

  if (ca) {
    console.log('Using npmconf ca')
    options.agentOptions = {
      ca: ca
    }
  }

  return options
}

function handleRequestError(error) {
  if (error && error.stack && error.stack.indexOf('SELF_SIGNED_CERT_IN_CHAIN') != -1) {
      console.error('Error making request, SELF_SIGNED_CERT_IN_CHAIN. ' +
          'Please read https://github.com/graingert/phantomjs#i-am-behind-a-corporate-proxy-that-uses-self-signed-ssl-certificates-to-intercept-encrypted-traffic')
      exit(1)
  } else if (error) {
    console.error('Error making request.\n' + error.stack + '\n\n' +
        'Please report this full log at https://github.com/graingert/phantomjs')
    exit(1)
  } else {
    console.error('Something unexpected happened, please report this full ' +
        'log at https://github.com/graingert/phantomjs')
    exit(1)
  }
}

function requestBinary(requestOptions, filePath) {
  var deferred = kew.defer()

  var writePath = filePath + '-download-' + Date.now()

  console.log('Receiving...')
  var bar = null
  requestProgress(request(requestOptions, function (error, response, body) {
    console.log('')
    if (!error && response.statusCode === 200) {
      fs.writeFileSync(writePath, body)
      console.log('Received ' + Math.floor(body.length / 1024) + 'K total.')
      fs.renameSync(writePath, filePath)
      deferred.resolve(filePath)

    } else if (response) {
      console.error('Error requesting archive.\n' +
          'Status: ' + response.statusCode + '\n' +
          'Request options: ' + JSON.stringify(requestOptions, null, 2) + '\n' +
          'Response headers: ' + JSON.stringify(response.headers, null, 2) + '\n' +
          'Make sure your network and proxy settings are correct.\n\n' +
          'If you continue to have issues, please report this full log at ' +
          'https://github.com/graingert/slimerjs')
      exit(1)
    } else {
      handleRequestError(error)
    }
  })).on('progress', function (state) {
    try {
      if (!bar) {
        bar = new progress('  [:bar] :percent', {total: state.size.total, width: 40})
      }
      bar.curr = state.size.transferred
      bar.tick()
    } catch (e) {
      // It doesn't really matter if the progress bar doesn't update.
    }
  })
  .on('error', handleRequestError)

  return deferred.promise
}


function extractDownload(filePath) {
  var deferred = kew.defer()
  // extract to a unique directory in case multiple processes are
  // installing and extracting at once
  var extractedPath = filePath + '-extract-' + Date.now()
  var options = {cwd: extractedPath}

  fs.mkdirsSync(extractedPath, '0777')
  // Make double sure we have 0777 permissions; some operating systems
  // default umask does not allow write by default.
  fs.chmodSync(extractedPath, '0777')

  if (filePath.substr(-4) === '.zip') {
    console.log('Extracting zip contents')

    try {
      var zip = new AdmZip(filePath)
      zip.extractAllTo(extractedPath, true)
      deferred.resolve(extractedPath)
    } catch (err) {
      console.error('Error extracting zip')
      deferred.reject(err)
    }

  } else {
    console.log('Extracting tar contents (via spawned process)')
    cp.execFile('tar', ['jxf', path.resolve(filePath)], options, function (err) {
      if (err) {
        console.error('Error extracting archive')
        deferred.reject(err)
      } else {
        deferred.resolve(extractedPath)
      }
    })
  }
  return deferred.promise
}


function copyIntoPlace(extractedPath, targetPath) {
  console.log('Removing', targetPath)
  return kew.nfcall(fs.remove, targetPath).then(function () {
    // Look for the extracted directory, so we can rename it.
    var files = fs.readdirSync(extractedPath)
    for (var i = 0; i < files.length; i++) {
      var file = path.join(extractedPath, files[i])
      if (fs.statSync(file).isDirectory() && file.indexOf(helper.version) != -1) {
        console.log('Copying extracted folder', file, '->', targetPath)
        return kew.nfcall(fs.move, file, targetPath)
      }
    }

    console.log('Could not find extracted file', files)
    throw new Error('Could not find extracted file')
  })
}

/**
 * Check to see if the binary in lib is OK to use. If successful, exit the process.
 */
function trySlimerjsInLib() {
  return kew.fcall(function () {
    var libModule = require('./lib/location.js')
    if (libModule.location &&
        getTargetPlatform() == libModule.platform &&
        getTargetArch() == libModule.arch &&
        fs.statSync(path.join('./lib', libModule.location))) {
      console.log('SlimerJS is previously installed at ' + libModule.location)
      exit(0)
    }
  }).fail(function () {
    // silently swallow any errors
  })
}

/**
 * Check to see if the binary on PATH is OK to use. If successful, exit the process.
 */
function trySlimerjsOnPath() {
  if (getTargetPlatform() != process.platform || getTargetArch() != process.arch) {
    console.log('Building for target platform ' + getTargetPlatform() + '/' + getTargetArch() +
                '. Skipping PATH search')
    return kew.resolve(false)
  }

  return kew.nfcall(which, 'slimerjs')
  .then(function (result) {
    slimerPath = result

    // Horrible hack to avoid problems during global install. We check to see if
    // the file `which` found is our own bin script.
    if (slimerPath.indexOf(path.join('npm', 'slimerjs')) !== -1) {
      console.log('Looks like an `npm install -g` on windows; unable to check for already installed version.')
      return
    }

    var contents = fs.readFileSync(slimerPath, 'utf8')
    if (/NPM_INSTALL_MARKER/.test(contents)) {
      console.log('Looks like an `npm install -g`; unable to check for already installed version.')
    } else {
      return checkSlimerjsVersion(slimerPath).then(function (matches) {
        if (matches) {
          writeLocationFile(slimerPath)
          console.log('SlimerJS is already installed on PATH at', slimerPath)
          exit(0)
        }
      })
    }
  }, function () {
    console.log('SlimerJS not found on PATH')
  })
  .fail(function (err) {
    console.error('Error checking path, continuing', err)
    return false
  })
}

/**
 * @return {?string} Get the download URL for slimerjs.
 *     May return null if no download url exists.
 */
function getDownloadUrl() {
  var spec = getDownloadSpec()
  return spec && spec.url
}

/**
 * @return {?{url: string, checksum: string}} Get the download URL and expected
 *     SHA-256 checksum for phantomjs.  May return null if no download url exists.
 */
function getDownloadSpec() {
  var cdnUrl = process.env.npm_config_slimerjs_cdnurl ||
      process.env.SLIMERJS_CDNURL ||
      'https://download.slimerjs.org/releases'
  var downloadUrl = cdnUrl + '/' + helper.version +'/slimerjs-'+ helper.version +'-'
  var checksum = ''

  var platform = getTargetPlatform()
  var arch = getTargetArch()
  if (platform === 'linux' && arch === 'x64') {
    downloadUrl += 'linux-x86_64.tar.bz2'
    checksum = '14e707c838e85f8131fb59b8cc38b5d81b4d45c194db7432e97ff331c913b89d'
  } else if (platform === 'linux' && arch == 'ia32') {
    downloadUrl += 'linux-i686.tar.bz2'
    checksum = '4bc37cb8c58e5ddfa76ffd066ebceb04529d74a0e52066d9bed9759c30e5841b'
  } else if (platform === 'darwin' || platform === 'openbsd' || platform === 'freebsd') {
    downloadUrl += 'mac.tar.bz2'
    checksum = '5c3ba9a83328a54b1fc6a6106abdd6d6b2117768f36ad43b9b0230a3ad7113cd'
  } else if (platform === 'win32') {
    downloadUrl += 'win32.zip'
    checksum = '4eead5e92a87f655f999ae79bf3c4eac191ec4bd93a19ffd8bbb2a12a1cb1ef4'
  } else {
    return null
  }
  return {url: downloadUrl, checksum: checksum}
}

/**
 * Download slimerjs, reusing the existing copy on disk if available.
 * Exits immediately if there is no binary to download.
 * @return {Promise.<string>} The path to the downloaded file.
 */
function downloadSlimerjs() {
  var downloadSpec = getDownloadSpec()
  if (!downloadSpec) {
    console.error(
        'Unexpected platform or architecture: ' + getTargetPlatform() + '/' + getTargetArch() + '\n' +
        'It seems there is no binary available for your platform/architecture\n' +
        'Try to install SlimerJS globally')
    exit(1)
  }

  var downloadUrl = downloadSpec.url
  var downloadedFile

  return kew.fcall(function () {
    // Can't use a global version so start a download.
    var tmpPath = findSuitableTempDirectory()
    var fileName = downloadUrl.split('/').pop()
    downloadedFile = path.join(tmpPath, fileName)

    if (fs.existsSync(downloadedFile)) {
      console.log('Download already available at', downloadedFile)
      return verifyChecksum(downloadedFile, downloadSpec.checksum)
    }
    return false
  }).then(function (verified) {
    if (verified) {
      return downloadedFile
    }

    // Start the install.
    console.log('Downloading', downloadUrl)
    console.log('Saving to', downloadedFile)
    return requestBinary(getRequestOptions(), downloadedFile)
  })
}

/**
 * Check to make sure that the file matches the checksum.
 * @param {string} fileName
 * @param {string} checksum
 * @return {Promise.<boolean>}
 */
function verifyChecksum(fileName, checksum) {
  return kew.resolve(hasha.fromFile(fileName, {algorithm: 'sha256'})).then(function (hash) {
    var result = checksum == hash
    if (result) {
      console.log('Verified checksum of previously downloaded file')
    } else {
      console.log('Checksum did not match')
    }
    return result
  }).fail(function (err) {
    console.error('Failed to verify checksum: ', err)
    return false
  })
}

/**
 * Check to make sure a given binary is the right version.
 * @return {kew.Promise.<boolean>}
 */
function checkSlimerjsVersion(slimerPath) {
  console.log('Found SlimerJS at', slimerPath, '...verifying')
  return kew.nfcall(cp.execFile, slimerPath, ['--version']).then(function (stdout) {
    var version = stdout.trim()
    if (helper.version == version) {
      return true
    } else {
      console.log('SlimerJS detected, but wrong version', stdout.trim(), '@', slimerPath + '.')
      return false
    }
  }).fail(function (err) {
    console.error('Error verifying slimerjs, continuing', err)
    return false
  })
}

/**
 * @return {string}
 */
function getTargetPlatform() {
  return process.env.SLIMERJS_PLATFORM || process.platform
}

/**
 * @return {string}
 */
function getTargetArch() {
  return process.env.SLIMERJS_ARCH || process.arch
}
