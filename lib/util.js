/**
 * @fileoverview Package-private helpers for the installer.
 */

'use strict'

var cp = require('child_process')
var fs = require('fs-extra')
var hasha = require('hasha')
var helper = require('./slimerjs')
var kew = require('kew')
var path = require('path')

var DEFAULT_CDN = 'https://github.com/graingert/slimer-downloads/releases/download/'
var libPath = __dirname

/**
 * Given a lib/location file of a PhantomJS previously installed with NPM,
 * try to link the binary to this lib/location.
 * @return {Promise<boolean>} True on success
 */
function maybeLinkLibModule(libPath) {
  return kew.fcall(function () {
    var libModule = require(libPath)
    if (libModule.location &&
        getTargetPlatform() == libModule.platform &&
        getTargetArch() == libModule.arch) {
      var resolvedLocation = path.resolve(path.dirname(libPath), libModule.location)
      if (fs.statSync(resolvedLocation)) {
        return checkSlimerjsVersion(resolvedLocation).then(function (matches) {
          if (matches) {
            writeLocationFile(resolvedLocation)
            console.log('SlimerJS linked at', resolvedLocation)
            return kew.resolve(true)
          }
        })
      }
    }
    return false
  }).fail(function () {
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
    if (stdout.indexOf('SlimerJS ' + helper.version + ',') !== -1) {
      return true
    } else {
      console.log('SlimerJS detected, but wrong version', stdout, '@', slimerPath + '.')
      return false
    }
  }).fail(function (err) {
    console.error('Error verifying slimerjs, continuing', err)
    return false
  })
}

/**
 * Writes the location file with location and platform/arch metadata about the
 * binary.
 */
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

/**
 * @return {?{url: string, checksum: string}} Get the download URL and expected
 *     SHA-256 checksum for phantomjs.  May return null if no download url exists.
 */
function getDownloadSpec() {
  var cdnUrl = process.env.npm_config_phantomjs_cdnurl ||
      process.env.PHANTOMJS_CDNURL ||
      DEFAULT_CDN
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

/** * Check to make sure that the file matches the checksum.
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

module.exports = {
  checkSlimerjsVersion: checkSlimerjsVersion,
  getDownloadSpec: getDownloadSpec,
  getTargetPlatform: getTargetPlatform,
  getTargetArch: getTargetArch,
  maybeLinkLibModule: maybeLinkLibModule,
  verifyChecksum: verifyChecksum,
  writeLocationFile: writeLocationFile
}
