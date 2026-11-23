// MSROAD '끌어서 다른 앱에 넣기' 시험 (맥 빌드 서버 smoke-mac.sh 가 불러요, 1.3.5)
// 앱 창의 악보 카드를 진짜 마우스처럼 누르고 끌어서, 맥의 끌기 보드(drag pasteboard)에 원본 파일이 올라갔는지 봐요.
// 쓰는 법: swift dragout-test.swift <앱 이름> <창 안 x> <창 안 y(제목 막대 아래 화면 기준)> <원본 파일 경로…>
// 끌기 보드에 그 원본 파일들이 그대로 있으면 "ok …" 를 찍고 0 으로 끝나요. 놓는 곳은 창 오른쪽 바깥(바탕 화면)이에요.
import Cocoa

let args = CommandLine.arguments
guard args.count >= 5, let cx = Double(args[2]), let cy = Double(args[3]) else { print("usage"); exit(2) }
let appName = args[1]
let expected = Array(args[4...]).map { URL(fileURLWithPath: $0).standardizedFileURL.path.precomposedStringWithCanonicalMapping }

func bounds() -> CGRect? {
    let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    for w in list where (w[kCGWindowOwnerName as String] as? String) == appName && (w[kCGWindowLayer as String] as? Int) == 0 {
        if let d = w[kCGWindowBounds as String] as? NSDictionary, let r = CGRect(dictionaryRepresentation: d), r.width > 300 { return r }
    }
    return nil
}

func post(_ type: CGEventType, _ p: CGPoint, wait: useconds_t = 30_000) {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(wait)
}

func dragPaths() -> [String] {
    let pb = NSPasteboard(name: .drag)
    let urls = pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
    return urls.map { $0.standardizedFileURL.path.precomposedStringWithCanonicalMapping }
}

guard let b = bounds() else { print("no-window"); exit(2) }
NSPasteboard(name: .drag).clearContents()
let start = CGPoint(x: b.minX + cx, y: b.minY + 28 + cy)   // 28 = 제목 막대 높이
post(.mouseMoved, start, wait: 300_000)
post(.leftMouseDown, start, wait: 120_000)
var p = start
for i in 1...14 {
    p = CGPoint(x: start.x + CGFloat(i) * 14, y: start.y + CGFloat(i) * 4)
    post(.leftMouseDragged, p)
}
usleep(900_000)   // 화면 → 맥 끌기 시작까지 기다려요 (아직 누르고 있음)
let during = dragPaths()
// 창 오른쪽 바깥으로 옮겨서 놓아요
let screen = NSScreen.screens.first?.frame ?? .zero
let target = CGPoint(x: min(b.maxX + 120, screen.maxX - 40), y: min(start.y + 40, screen.maxY - 120))
for i in 1...12 {
    let t = CGFloat(i) / 12
    post(.leftMouseDragged, CGPoint(x: p.x + (target.x - p.x) * t, y: p.y + (target.y - p.y) * t))
}
usleep(300_000)
post(.leftMouseUp, target, wait: 800_000)
let names = during.map { ($0 as NSString).lastPathComponent }.joined(separator: ", ")
if during == expected {
    print("ok \(during.count) [\(names)] drop@\(Int(target.x)),\(Int(target.y))")
    exit(0)
}
let types = NSPasteboard(name: .drag).types?.map { $0.rawValue }.joined(separator: " ") ?? "-"
print("bad got=[\(names)] types=\(types)")
exit(1)
