import UIKit
import WebKit

final class GameViewController: UIViewController, WKNavigationDelegate {
    private var webView: WKWebView!
    private var gameFolder: URL?

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 23 / 255.0, green: 19 / 255.0, blue: 41 / 255.0, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = self
        view.addSubview(webView)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            webView.topAnchor.constraint(equalTo: safe.topAnchor),
            webView.bottomAnchor.constraint(equalTo: safe.bottomAnchor)
        ])
        loadGame()
    }

    private func loadGame() {
        guard let file = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Game") else {
            showError("Oyun dosyası pakette bulunamadı. Lütfen uygulamayı yeniden yükleyin.")
            return
        }
        gameFolder = file.deletingLastPathComponent().standardizedFileURL
        webView.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let folder = gameFolder else {
            decisionHandler(.cancel); return
        }
        let allowed = url.isFileURL && url.standardizedFileURL.path.hasPrefix(folder.path + "/")
        decisionHandler(allowed ? .allow : .cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { loadGame() }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showError("Oyun açılamadı. Lütfen tekrar deneyin.") }
    }

    private func showError(_ message: String) {
        let alert = UIAlertController(title: "BLOOP", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Tekrar dene", style: .default) { [weak self] _ in self?.loadGame() })
        present(alert, animated: true)
    }
}
