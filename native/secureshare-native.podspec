require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "secureshare-native"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/your-github-account/secureshare-native"
  s.license      = package["license"]
  s.authors      = { "Your Name" => "your@email.com" }
  s.platforms    = { :ios => "13.4" }
  s.source       = { :git => "https://github.com/your-github-account/secureshare-native.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }

  s.dependency "React-Core"
end
