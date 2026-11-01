// Convert the approved source artwork into transparent browser resources.
import AppKit
import ImageIO
import UniformTypeIdentifiers

let source = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let image = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(source as CFURL, nil)!, 0, nil)!
let w = image.width, h = image.height
var pixels = [UInt8](repeating: 0, count: w * h * 4)
pixels.withUnsafeMutableBytes { bytes in
  let context = CGContext(data: bytes.baseAddress, width: w, height: h, bitsPerComponent: 8,
      bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
}
// Remove only near-white background connected to the image boundary. The
// white cart inside the colored circle remains part of the artwork.
var seen = [Bool](repeating: false, count: w * h)
var queue = [Int]()
func visit(_ p: Int) {
  if seen[p] { return }; seen[p] = true
  let i = p * 4
  if pixels[i] > 238 && pixels[i+1] > 238 && pixels[i+2] > 238 { queue.append(p) }
}
for x in 0..<w { visit(x); visit((h-1)*w+x) }
for y in 0..<h { visit(y*w); visit(y*w+w-1) }
var cursor = 0
while cursor < queue.count {
  let p = queue[cursor]; cursor += 1
  for c in 0..<4 { pixels[p*4+c] = 0 }
  if p % w > 0 { visit(p-1) }; if p % w < w-1 { visit(p+1) }
  if p >= w { visit(p-w) }; if p < (h-1)*w { visit(p+w) }
}
var minX=w, minY=h, maxX=0, maxY=0
for y in 0..<h { for x in 0..<w where pixels[(y*w+x)*4+3] > 0 {
  minX=min(minX,x); minY=min(minY,y); maxX=max(maxX,x); maxY=max(maxY,y)
} }
let provider = CGDataProvider(data: Data(pixels) as CFData)!
let full = CGImage(width:w,height:h,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:w*4,
    space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue),
    provider:provider,decode:nil,shouldInterpolate:true,intent:.defaultIntent)!
let cropped = full.cropping(to:CGRect(x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1))!
let dimensions = try JSONSerialization.jsonObject(with: Data(contentsOf: output.appendingPathComponent("dimensions.json"))) as! [[Int]]
for pair in dimensions {
  let width=pair[0], height=pair[1], side=min(width,height)
  let context=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:width*4,
      space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
  context.interpolationQuality = .high
  context.draw(cropped,in:CGRect(x:(width-side)/2,y:(height-side)/2,width:side,height:side))
  let destination=CGImageDestinationCreateWithURL(output.appendingPathComponent("\(width)x\(height).png") as CFURL,UTType.png.identifier as CFString,1,nil)!
  CGImageDestinationAddImage(destination,context.makeImage()!,nil)
  precondition(CGImageDestinationFinalize(destination))
}
let sizes = [16,22,24,32,44,48,64,96,128,256]
for size in sizes {
  for disabled in [false,true] {
    let context = CGContext(data:nil,width:size,height:size,bitsPerComponent:8,bytesPerRow:size*4,
        space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.interpolationQuality = .high
    context.setAlpha(disabled ? 0.42 : 1)
    context.draw(cropped,in:CGRect(x:0,y:0,width:size,height:size))
    let url = output.appendingPathComponent("\(size)\(disabled ? "-disabled" : "").png")
    let destination = CGImageDestinationCreateWithURL(url as CFURL,UTType.png.identifier as CFString,1,nil)!
    CGImageDestinationAddImage(destination,context.makeImage()!,nil)
    precondition(CGImageDestinationFinalize(destination))
  }
}
// VectorIcon supports filled paths, rather than embedded raster images.
// Encode a small sampled version of the same artwork as horizontal runs;
// this retains the source geometry without drawing a different cart by hand.
let size=96
let context=CGContext(data:nil,width:size,height:size,bitsPerComponent:8,bytesPerRow:size*4,
    space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
context.draw(cropped,in:CGRect(x:0,y:0,width:size,height:size))
let raw=context.data!.assumingMemoryBound(to:UInt8.self)
let palette:[[Int]]=[[255,83,64],[0,124,128],[255,178,10],[255,255,255]]
func color(_ x:Int,_ y:Int)->Int {
  let i=(y*size+x)*4
  if raw[i+3]<128 {return -1}
  return palette.indices.min { a,b in
    (0..<3).reduce(0){$0 + (Int(raw[i+$1])-palette[a][$1])*(Int(raw[i+$1])-palette[a][$1])} <
    (0..<3).reduce(0){$0 + (Int(raw[i+$1])-palette[b][$1])*(Int(raw[i+$1])-palette[b][$1])}
  }!
}
var icon="// Generated from assets/ecom-icon.png by ecom/generate-ui-icons.mjs.\nCANVAS_DIMENSIONS, 96,\n"
for c in palette.indices {
  if c>0 {icon += "NEW_PATH,\n"}
  icon += "PATH_COLOR_ARGB, 0xFF, " + palette[c].map{String(format:"0x%02X",$0)}.joined(separator:", ") + ",\n"
  for y in 0..<size {
    var x=0
    while x<size {
      if color(x,y) != c {x += 1;continue}
      let start=x; while x<size && color(x,y)==c {x += 1}
      icon += "MOVE_TO, \(start), \(y),\nLINE_TO, \(x), \(y),\nLINE_TO, \(x), \(y+1),\nLINE_TO, \(start), \(y+1),\nCLOSE,\n"
    }
  }
}
try icon.write(to:output.appendingPathComponent("product.icon"),atomically:false,encoding:.utf8)
