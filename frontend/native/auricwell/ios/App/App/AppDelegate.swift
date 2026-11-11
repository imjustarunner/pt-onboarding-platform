import UIKit
import Capacitor
import Security
import LocalAuthentication
import AuthenticationServices
import UserNotifications

@objc(AuricwellBridgeViewController)
class AuricwellBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(AuricwellDevice()) }
}
@objc(AuricwellDevice)
class AuricwellDevice: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    let identifier = "AuricwellDevice", jsName = "AuricwellDevice"
    let pluginMethods = ["status", "request", "exchange", "unlockWithBiometrics", "configureBiometrics", "signIn", "registerPush", "pendingNotification", "reveal", "shareFile"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    static weak var current: AuricwellDevice?
    static var notificationURL: String?
    private var authentication: ASWebAuthenticationSession?
    private var pushCall: CAPPluginCall?
    override func load() { Self.current = self }
    private var keychainQuery: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.auricwell.mobile.device", kSecAttrAccount as String: "device-session"] }
    private func token() -> String? {
        var query = keychainQuery
        query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    private func save(_ token: String) throws {
        SecItemDelete(keychainQuery as CFDictionary)
        var query = keychainQuery
        query[kSecValueData as String] = Data(token.utf8); query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw NSError(domain: "AuricwellKeychain", code: 1) }
    }
    @objc func status(_ call: CAPPluginCall) { call.resolve(["biometrics": LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)]) }
    // Durable credentials never cross the bridge into JavaScript.
    private func send(_ call: CAPPluginCall, path: String, method: String, data: [String: Any] = [:], exchange: Bool = false, sessionToken: String? = nil) {
        var request = URLRequest(url: URL(string: "https://auricwell.com/api/mobile" + path)!)
        request.httpMethod = method; request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.setValue("1", forHTTPHeaderField: "X-Auricwell-Mobile")
        if let credential = token() { request.setValue(credential, forHTTPHeaderField: "X-Auricwell-Device") }
        else if !exchange { if path == "/logout" { call.resolve(["signedOut": true]); return }; call.reject("Sign in to this device again.", "MOBILE_SIGN_IN_REQUIRED"); return }
        if let sessionToken = sessionToken { request.setValue(sessionToken, forHTTPHeaderField: "X-Quick-View-Session") }
        if method != "GET" { request.httpBody = try? JSONSerialization.data(withJSONObject: data) }
        let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil; config.urlCache = nil
        let session = URLSession(configuration: config, delegate: NoRedirect(), delegateQueue: nil)
        session.dataTask(with: request) { bytes, response, error in
            defer { session.finishTasksAndInvalidate() }
            if error != nil { call.reject("Could not reach AuricWell. Your code is still entered. Check your connection and try again.", "MOBILE_CONNECTION_FAILED"); return }
            guard let http = response as? HTTPURLResponse, let bytes = bytes, var result = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] else { call.reject("AuricWell returned an incomplete response. Please try again.", "MOBILE_INVALID_RESPONSE"); return }
            guard (200..<300).contains(http.statusCode) else {
                let failure = result["error"] as? [String: Any], code = (result["error"] as? [String: Any])?["code"] as? String ?? "MOBILE_REQUEST_FAILED"
                if ["MOBILE_SIGN_IN_REQUIRED", "MOBILE_ACCOUNT_CHANGED", "ACCOUNT_DISABLED", "ACCOUNT_UNAVAILABLE", "MOBILE_WORKSPACE_UNAVAILABLE", "MOBILE_FAMILY_UNAVAILABLE", "HIRE_ACTIVATION_REQUIRED", "PRODUCT_SESSION_MISMATCH"].contains(code) { SecItemDelete(self.keychainQuery as CFDictionary) }
                call.reject(failure?["message"] as? String ?? "Could not open your workspace.", code); return
            }
            if exchange {
                guard let token = result.removeValue(forKey: "deviceToken") as? String else { call.reject("Sign-in could not be completed."); return }
                do { try self.save(token) } catch { call.reject("Could not protect sign-in in the device Keychain."); return }
            }
            if path == "/logout" { SecItemDelete(self.keychainQuery as CFDictionary) }
            call.resolve(result)
        }.resume()
    }
    @objc func request(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? "", method = call.getString("method") ?? "GET"
        guard (path == "/session" && method == "GET") || (["/code", "/unlock", "/logout", "/resume", "/lock", "/app-lock", "/activity"].contains(path) && method == "POST") else { call.reject("Unsupported request"); return }
        var data = call.getObject("data") ?? [:]; data.removeValue(forKey: "biometric")
        send(call, path: path, method: method, data: data, sessionToken: call.getString("sessionToken"))
    }
    @objc func exchange(_ call: CAPPluginCall) {
        var data = call.getObject("data") ?? [:]; data["clientId"] = "ios"; data["redirectUri"] = "com.auricwell.mobile://auth"
        send(call, path: "/exchange", method: "POST", data: data, exchange: true)
    }
    @objc func unlockWithBiometrics(_ call: CAPPluginCall) {
        let context = LAContext(); context.localizedFallbackTitle = "Use account sign-in"
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Unlock your Auricwell workspace") { accepted, _ in
            guard accepted else { call.reject("Use password, SSO or a passkey to recover access.", "MOBILE_BIOMETRIC_CANCELLED"); return }
            self.send(call, path: "/unlock", method: "POST", data: ["biometric": true])
        }
    }
    @objc func configureBiometrics(_ call: CAPPluginCall) {
        let context = LAContext()
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Enable biometric app lock for Auricwell") { accepted, _ in
            guard accepted else { call.reject("Biometric app lock was not enabled.", "MOBILE_BIOMETRIC_CANCELLED"); return }
            self.send(call, path: "/app-lock", method: "POST", data: ["method": "biometric", "biometric": true], sessionToken: call.getString("sessionToken"))
        }
    }
    @objc func signIn(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https", url.path == "/mobile/connect" else { call.reject("Invalid sign-in address"); return }
        DispatchQueue.main.async {
            self.authentication = ASWebAuthenticationSession(url: url, callbackURLScheme: "com.auricwell.mobile") { callback, _ in
                guard let callback = callback else { call.reject("Sign-in was cancelled."); return }
                call.resolve(["url": callback.absoluteString]); self.authentication = nil
            }
            self.authentication?.presentationContextProvider = self
            if self.authentication?.start() != true { call.reject("Could not open secure sign-in.") }
        }
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { bridge?.viewController?.view.window ?? ASPresentationAnchor() }
    @objc func registerPush(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { call.reject("Notifications are off in this device’s settings."); return }
            DispatchQueue.main.async {
                self.pushCall = call; UIApplication.shared.registerForRemoteNotifications()
                DispatchQueue.main.asyncAfter(deadline: .now() + 20) { if self.pushCall === call { self.failedPush() } }
            }
        }
    }
    func registeredPush(_ data: Data) {
        let token = data.map { String(format: "%02x", $0) }.joined()
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif
        pushCall?.resolve(["token": token, "environment": environment]); pushCall = nil
    }
    func failedPush() { pushCall?.reject("Apple could not register this device. Try again."); pushCall = nil }
    @objc func shareFile(_ call: CAPPluginCall) {
        guard let encoded = call.getString("data"), let data = Data(base64Encoded: encoded) else { call.reject("Could not open this file."); return }
        let name = URL(fileURLWithPath: call.getString("filename") ?? "attachment").lastPathComponent
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("AuricwellAttachments").appendingPathComponent(UUID().uuidString)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
            let url = folder.appendingPathComponent(name.isEmpty ? "attachment" : name)
            try data.write(to: url, options: .completeFileProtection)
            DispatchQueue.main.async {
                let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                share.popoverPresentationController?.sourceView = self.bridge?.viewController?.view
                share.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: folder) }
                self.bridge?.viewController?.present(share, animated: true); call.resolve()
            }
        } catch { try? FileManager.default.removeItem(at: folder); call.reject("Could not open this file.") }
    }
    @objc func pendingNotification(_ call: CAPPluginCall) { call.resolve(["url": Self.notificationURL ?? ""]); Self.notificationURL = nil }
    @objc func reveal(_ call: CAPPluginCall) { DispatchQueue.main.async { (UIApplication.shared.delegate as? AppDelegate)?.reveal(); call.resolve() } }
}
private class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?
    private var privacy: UIView?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool { UNUserNotificationCenter.current().delegate = self; try? FileManager.default.removeItem(at: FileManager.default.temporaryDirectory.appendingPathComponent("AuricwellAttachments")); return true }
    func applicationWillResignActive(_ application: UIApplication) {
        guard privacy == nil, let window = window else { return }
        let cover = UIView(frame: window.bounds); cover.backgroundColor = UIColor(red: 0.95, green: 0.97, blue: 1, alpha: 1); cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        let label = UILabel(frame: cover.bounds); label.text = "AuricWell · Workspace protected"; label.textAlignment = .center; label.textColor = .systemBlue
        cover.addSubview(label); window.addSubview(cover); privacy = cover
    }
    func applicationDidEnterBackground(_ application: UIApplication) { AuricwellDevice.current?.notifyListeners("deviceLocked", data: [:]) }
    func applicationDidBecomeActive(_ application: UIApplication) { AuricwellDevice.current?.notifyListeners("privacyReady", data: [:]) }
    func reveal() { privacy?.removeFromSuperview(); privacy = nil }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) { AuricwellDevice.current?.registeredPush(token) }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { AuricwellDevice.current?.failedPush() }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { completionHandler([.banner, .sound, .list]) }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if let url = response.notification.request.content.userInfo["url"] as? String { AuricwellDevice.notificationURL = url; AuricwellDevice.current?.notifyListeners("notificationTapped", data: ["url": url]) }
        completionHandler()
    }
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool { ApplicationDelegateProxy.shared.application(app, open: url, options: options) }
    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool { ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler) }
}
