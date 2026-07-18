require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'SecureWatermark'
  s.version        = package['version']
  s.summary        = package['description'] || 'Native secure watermark module'
  s.description    = package['description'] || 'Native secure watermark module'
  s.license        = package['license'] || 'ISC'
  s.author         = package['author'] || ''
  s.homepage       = 'https://secureshare.app'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # CryptoKit (AES-GCM, HMAC) and Vision (OCR) are system frameworks and are
  # linked automatically via Swift's import autolinking.

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
