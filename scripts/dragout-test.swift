// MSROAD '끌어서 다른 앱에 넣기' 시험 (맥 빌드 서버 smoke-mac.sh 가 불러요, 1.3.5)
// 이 시험이 '다른 앱' 역할을 해요: 화면 왼쪽 아래에 파일을 받는 작은 창을 띄우고, MSROAD 창의 악보 카드를
// 진짜 마우스처럼 눌러 그 창까지 끌어다 놓아요. 받은 파일이 원본 파일(경로 · 크기 그대로)이면 마지막 줄에 "ok …", 0 으로 끝나요.
// 쓰는 법: swift dragout-test.swift <앱 이름> <창 안 x> <창 안 y(제목 막대 아래 화면 기준)> <원본 파일 경로…>
import Cocoa

let args = CommandLine.arguments
guard args.count >= 5, let cx = Double(args[2]), let cy = Double(args[3]) else { print("usage"); exit(2) }
let appName = args[1]
let norm = { (p: String) in URL(fileURLWithPath: p).standardizedFileURL.path.precomposedStringWithCanonicalMapping }
let expected = Array(args[4...]).map(norm)
let df = DateFormatter(); df.dateFormat = "HH:mm:ss.SSS"
func log(_ s: String) { print("\(df.string(from: Date())) \(s)"); fflush(stdout) }

func bounds() -> CGRect? {
    let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    for w in list where (w[kCGWindowOwnerName as String] as? String) == appName && (w[kCGWindowLayer as String] as? Int) == 0 {
        if let d = w[kCGWindowBounds as String] as? NSDictionary, let r = CGRect(dictionaryRepresentation: d), r.width > 300 { return r }
    }
    return nil
}

func finish(_ line: String, _ code: Int32) -> Never { print(line); fflush(stdout); exit(code) }

/// 파일을 받는 '다른 앱' 창의 내용
final class DropView: NSView {
    override init(frame: NSRect) {
        super.init(frame: frame)
        registerForDraggedTypes([.fileURL, .URL, .tiff, .png])
        wantsLayer = true
        layer?.backgroundColor = NSColor.systemYellow.cgColor
    }
    required init?(coder: NSCoder) { fatalError() }
    override func draggingEntered(_ s: NSDraggingInfo) -> NSDragOperation {
        log("받는 창에 들어옴: types=\(s.draggingPasteboard.types?.map { $0.rawValue } ?? []) mask=\(s.draggingSourceOperationMask.rawValue)")
        return .copy
    }
    override func draggingUpdated(_ s: NSDraggingInfo) -> NSDragOperation { .copy }
    override func performDragOperation(_ s: NSDraggingInfo) -> Bool {
        let pb = s.draggingPasteboard
        let urls = pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
        let got = urls.map { norm($0.path) }
        let sizes = urls.map { (try? FileManager.default.attributesOfItem(atPath: $0.path)[.size] as? Int) ?? -1 }
        let names = got.map { ($0 as NSString).lastPathComponent }
        log("놓음: \(names) 크기=\(sizes) types=\(pb.types?.map { $0.rawValue } ?? [])")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            if got == expected { finish("ok \(got.count) [\(names.joined(separator: ", "))] 크기 \(sizes)", 0) }
            finish("bad got=\(names) want=\(expected.map { ($0 as NSString).lastPathComponent })", 1)
        }
        return true
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
guard let b = bounds(), let screen = NSScreen.screens.first else { finish("no-window", 2) }
// 받는 창: 화면 왼쪽 아래 (Dock 위), 맨 앞에 떠 있게
let dropCG = CGRect(x: 10, y: screen.frame.height - 330, width: 260, height: 200)   // 화면 위쪽 기준(CG) 자리
let win = NSWindow(contentRect: NSRect(x: dropCG.minX, y: screen.frame.height - dropCG.maxY, width: dropCG.width, height: dropCG.height),
                   styleMask: [.borderless], backing: .buffered, defer: false)
win.level = .floating
win.contentView = DropView(frame: NSRect(origin: .zero, size: dropCG.size))
win.orderFrontRegardless()

let shotDir = ProcessInfo.processInfo.environment["OUT"] ?? "/tmp"
let tag = ProcessInfo.processInfo.environment["DRAG_TAG"] ?? "x"
func shot(_ name: String) {
    let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    p.arguments = ["-x", "\(shotDir)/shot-dragout-\(tag)-\(name).png"]
    try? p.run(); p.waitUntilExit()
}

func post(_ type: CGEventType, _ p: CGPoint, wait: useconds_t = 40_000) {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(wait)
}

Thread.detachNewThread {
    usleep(800_000)
    let start = CGPoint(x: b.minX + cx, y: b.minY + 28 + cy)   // 28 = 제목 막대 높이
    log("창 \(b) · 누르는 곳 \(start) · 받는 창 \(dropCG)")
    post(.mouseMoved, start, wait: 300_000)
    post(.leftMouseDown, start, wait: 150_000)
    var p = start
    for i in 1...20 {
        p = CGPoint(x: start.x + CGFloat(i) * 6, y: start.y + CGFloat(i) * 2)
        post(.leftMouseDragged, p)
    }
    usleep(700_000)
    log("받는 창 보임=\(win.isVisible) 번호=\(win.windowNumber) 화면위=\(win.isOnActiveSpace)")
    shot("1-start")
    let target = CGPoint(x: dropCG.midX, y: dropCG.midY)
    for i in 1...25 {
        let t = CGFloat(i) / 25
        post(.leftMouseDragged, CGPoint(x: p.x + (target.x - p.x) * t, y: p.y + (target.y - p.y) * t))
    }
    for _ in 0..<5 { post(.leftMouseDragged, CGPoint(x: target.x + 1, y: target.y), wait: 80_000) }
    usleep(400_000)
    shot("2-over")
    post(.leftMouseUp, target, wait: 200_000)
    log("마우스 뗌 @\(Int(target.x)),\(Int(target.y))")
    usleep(4_000_000)
    post(.leftMouseUp, target, wait: 100_000)   // 혹시 늦게 시작된 끌기가 있으면 끝내요
    DispatchQueue.main.async { finish("bad no-drop (받는 창에 아무것도 안 놓임)", 1) }
}
app.run()
