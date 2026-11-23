// MSROAD '끌어서 다른 앱에 넣기' 시험 (맥 빌드 서버 smoke-mac.sh 가 불러요, 1.3.5)
// 앱 창의 악보 카드를 진짜 마우스처럼 누르고 끌어서, 맥의 끌기 보드(drag pasteboard)에 원본 파일이 올라갔는지 봐요.
// 쓰는 법: swift dragout-test.swift <앱 이름> <창 안 x> <창 안 y(제목 막대 아래 화면 기준)> <원본 파일 경로…>
// 끌기 보드에 그 원본 파일들이 그대로 있으면 마지막 줄에 "ok …" 를 찍고 0 으로 끝나요.
// 놓는 곳: 창 왼쪽 바깥(바탕 화면)이 보이면 거기, 아니면 창 제목 막대(취소). 진행 기록(시각 포함)을 줄마다 찍어요.
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

let pb = NSPasteboard(name: .drag)
var seenCount = pb.changeCount
var got: [String] = []
func watch(_ label: String) {
    if pb.changeCount != seenCount {
        seenCount = pb.changeCount
        let urls = pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
        let paths = urls.map { norm($0.path) }
        if !paths.isEmpty { got = paths }
        log("끌기 보드 바뀜(\(label)): \(paths.map { ($0 as NSString).lastPathComponent }) types=\(pb.types?.map { $0.rawValue } ?? [])")
    }
}
func post(_ type: CGEventType, _ p: CGPoint, wait: useconds_t = 40_000) {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(wait)
    watch("\(type.rawValue)")
}

guard let b = bounds() else { print("no-window"); exit(2) }
pb.clearContents(); seenCount = pb.changeCount
let start = CGPoint(x: b.minX + cx, y: b.minY + 28 + cy)   // 28 = 제목 막대 높이
log("창 \(b) · 누르는 곳 \(start)")
post(.mouseMoved, start, wait: 300_000)
post(.leftMouseDown, start, wait: 150_000)
var p = start
for i in 1...20 {
    p = CGPoint(x: start.x + CGFloat(i) * 6, y: start.y + CGFloat(i) * 2)
    post(.leftMouseDragged, p)
}
log("끌기 이동 끝 — 누른 채로 기다림")
for _ in 0..<20 { usleep(100_000); watch("기다림") }
// 놓을 곳: 창 왼쪽 바깥에 바탕 화면이 보이면 거기(Finder 가 복사), 아니면 창 제목 막대
let desk = b.minX > 60 ? CGPoint(x: b.minX / 2, y: b.midY) : CGPoint(x: b.minX + 200, y: b.minY + 14)
for i in 1...20 {
    let t = CGFloat(i) / 20
    post(.leftMouseDragged, CGPoint(x: p.x + (desk.x - p.x) * t, y: p.y + (desk.y - p.y) * t))
}
usleep(300_000); watch("놓기 전")
post(.leftMouseUp, desk, wait: 1_200_000)
log("놓음 @\(Int(desk.x)),\(Int(desk.y))")
usleep(1_000_000); watch("놓은 뒤")
post(.leftMouseUp, desk, wait: 300_000)   // 혹시 늦게 시작된 끌기가 있으면 끝내요
let names = got.map { ($0 as NSString).lastPathComponent }.joined(separator: ", ")
if got == expected { print("ok \(got.count) [\(names)] drop@\(Int(desk.x)),\(Int(desk.y))"); exit(0) }
print("bad got=[\(names)] want=\(expected.map { ($0 as NSString).lastPathComponent })")
exit(1)
