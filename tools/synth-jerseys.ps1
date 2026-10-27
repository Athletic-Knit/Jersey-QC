# Draws synthetic jersey backs for the recognition stress test (tools/recog-stress.mjs).
# GDI+ only, no packages. Output: public/sim/stress/synth/*.jpg + synth.json (truth per file).
# Each frame: a body colour with fabric noise, the name in block capitals with an
# outline, the big number, a small copy of the number on each sleeve edge (the
# model must ignore those), and the AK-style badge. Variants cover the letters
# and digits that look alike, low-contrast colour pairs, upside-down and
# sideways jerseys, name plates alone, number patches alone, and empty tables.
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out  = Join-Path $root "public\sim\stress\synth"
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out -Filter *.jpg | Remove-Item -Force

$W = 800; $H = 600
$rand = New-Object System.Random 7

function Col([string]$hex) { return [System.Drawing.ColorTranslator]::FromHtml($hex) }

function DrawOutlined($g, [string]$text, [string]$font, [float]$size, $x, $y, $fill, $outline, [float]$pen, [string]$align = "center") {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $fmt  = New-Object System.Drawing.StringFormat
  $fmt.Alignment = if ($align -eq "center") { [System.Drawing.StringAlignment]::Center } else { [System.Drawing.StringAlignment]::Near }
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $ff = New-Object System.Drawing.FontFamily $font
  $path.AddString($text, $ff, [int][System.Drawing.FontStyle]::Bold, $size, (New-Object System.Drawing.PointF $x, $y), $fmt)
  if ($pen -gt 0) { $p = New-Object System.Drawing.Pen $outline, $pen; $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round; $g.DrawPath($p, $path); $p.Dispose() }
  $b = New-Object System.Drawing.SolidBrush $fill; $g.FillPath($b, $path); $b.Dispose()
  $path.Dispose(); $fmt.Dispose(); $ff.Dispose()
}

function Noise($g, $w, $h, $n, $alpha) {
  for ($i = 0; $i -lt $n; $i++) {
    $v = $rand.Next(0, 255); $a = $rand.Next(0, $alpha)
    $b = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($a, $v, $v, $v))
    $g.FillRectangle($b, $rand.Next(0, $w), $rand.Next(0, $h), $rand.Next(2, 14), $rand.Next(2, 14)); $b.Dispose()
  }
}

# A jersey back: body colour, shoulder yoke, sleeve edges with small numbers, name, number, badge.
function Jersey($spec) {
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  # table under the jersey
  $g.Clear((Col "#8a7358"))
  Noise $g $W $H 400 60
  # body with a slight gradient (fabric sheen)
  $body = Col $spec.body
  $gb = New-Object System.Drawing.Drawing2D.LinearGradientBrush ((New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $W, $H), $body, [System.Drawing.Color]::FromArgb(255, [Math]::Min(255, $body.R + 25), [Math]::Min(255, $body.G + 25), [Math]::Min(255, $body.B + 25)))
  $g.FillRectangle($gb, 40, 20, ($W - 80), ($H - 40)); $gb.Dispose()
  Noise $g $W $H 900 28
  # stripes on the sleeve edges, and the small sleeve numbers
  $trim = Col $spec.trim
  $tb = New-Object System.Drawing.SolidBrush $trim
  $g.FillRectangle($tb, 40, 140, 70, 14); $g.FillRectangle($tb, 40, 175, 70, 14)
  $g.FillRectangle($tb, ($W - 110), 140, 70, 14); $g.FillRectangle($tb, ($W - 110), 175, 70, 14)
  $tb.Dispose()
  if ($spec.number -ne "" -and -not $spec.noSleeve) {
    $sl = if ($spec.sleeve) { $spec.sleeve } else { $spec.number }
    DrawOutlined $g $sl $spec.font 34 75 230 (Col $spec.text) (Col $spec.outline) 3
    DrawOutlined $g $sl $spec.font 34 ($W - 75) 230 (Col $spec.text) (Col $spec.outline) 3
  }
  # name (straight plate), then the big number
  if ($spec.name -ne "") { DrawOutlined $g $spec.name $spec.font $spec.nameSize ($W / 2) 150 (Col $spec.text) (Col $spec.outline) 5 }
  if ($spec.number -ne "") {
    $nx = ($W / 2) + $(if ($spec.shift) { $spec.shift } else { 0 })
    DrawOutlined $g $spec.number $spec.font 190 $nx 380 (Col $spec.text) (Col $spec.outline) 8
    if ($spec.mergedSleeve) {   # a folded sleeve lying right beside the back number, its small number touching it
      DrawOutlined $g $spec.mergedSleeve $spec.font 60 ($nx + 150) 410 (Col $spec.text) (Col $spec.outline) 4
    }
  }
  # badge
  $bb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White); $g.FillEllipse($bb, ($W / 2 - 28), ($H - 70), 56, 36); $bb.Dispose()
  DrawOutlined $g "AK" "Arial" 16 ($W / 2) ($H - 52) (Col "#1d4ed8") (Col "#dc2626") 1
  $g.Dispose()
  return $bmp
}

# A loose plate on the table: name plate or number patch, nothing else.
function Plate($spec) {
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear((Col "#8a7358")); Noise $g $W $H 600 70
  $pb = New-Object System.Drawing.SolidBrush (Col $spec.body)
  if ($spec.name -ne "") { $g.FillRectangle($pb, 80, 220, ($W - 160), 160); DrawOutlined $g $spec.name $spec.font 70 ($W / 2) 300 (Col $spec.text) (Col $spec.outline) 5 }
  else { $g.FillRectangle($pb, 250, 120, 300, 360); DrawOutlined $g $spec.number $spec.font 200 ($W / 2) 300 (Col $spec.text) (Col $spec.outline) 8 }
  $pb.Dispose(); $g.Dispose()
  return $bmp
}

# Nothing on the table: wood, a mat, a cable, a bag.
function Empty($kind) {
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear((Col "#8a7358")); Noise $g $W $H 1500 80
  if ($kind -eq "mat") { $mb = New-Object System.Drawing.SolidBrush (Col "#2b2b2b"); $g.FillRectangle($mb, 120, 90, 560, 420); $mb.Dispose(); Noise $g $W $H 700 40 }
  if ($kind -eq "cable") { $p = New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), 9; $g.DrawBezier($p, 60, 500, 300, 100, 500, 550, 760, 120); $p.Dispose() }
  if ($kind -eq "bag") { $bb = New-Object System.Drawing.SolidBrush (Col "#d9d9d9"); $g.FillEllipse($bb, 150, 120, 500, 380); $bb.Dispose(); Noise $g $W $H 900 50 }
  $g.Dispose()
  return $bmp
}

function Orient($bmp, $o) {
  switch ($o) {
    "upsidedown" { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
    "left"       { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
    "right"      { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
  }
  return $bmp
}

$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 82L

$manifest = @()
function Save($bmp, $id, $truth) {
  $f = Join-Path $out "$id.jpg"; $bmp.Save($f, $jpeg, $ep); $bmp.Dispose()
  $script:manifest += [ordered]@{ file = "synth/$id.jpg"; name = $truth.name; number = $truth.number; kind = $truth.kind; note = $truth.note }
}

# Colour schemes: body, text, outline, trim. The last three are low contrast on purpose.
$schemes = @(
  @{ id = "blk-red";   body = "#111111"; text = "#d7262c"; outline = "#ffffff"; trim = "#d7262c" },
  @{ id = "wht-blk";   body = "#f2f2f2"; text = "#111111"; outline = "#d7262c"; trim = "#111111" },
  @{ id = "navy-wht";  body = "#0f1f4b"; text = "#ffffff"; outline = "#c8102e"; trim = "#ffffff" },
  @{ id = "grn-gold";  body = "#0b4d2c"; text = "#d4af37"; outline = "#ffffff"; trim = "#d4af37" },
  @{ id = "yel-wht";   body = "#f2c320"; text = "#ffffff"; outline = "#f2c320"; trim = "#ffffff" },   # white on yellow, no real outline
  @{ id = "red-blk";   body = "#b11226"; text = "#1a1a1a"; outline = "#b11226"; trim = "#1a1a1a" },   # black on red
  @{ id = "gry-sil";   body = "#6b6b6b"; text = "#b8b8b8"; outline = "#6b6b6b"; trim = "#b8b8b8" }    # silver on grey
)
$fonts = @("Impact", "Arial Black")

# 1. Confusable names and digits, upright, first scheme/font, then rotate through.
$names = @("GOGOL", "COCO", "O'BRIEN", "SMITH-JONES", "DE LA CRUZ", "QUINN", "GABBARD", "LILLI", "MUNN", "SEACH", "EVANOVICH", "BJORNSTAD", "ZIEGLER", "ST. PIERRE", "VANDERMEULEN", "NG", "D'AMICO", "MACDONALD", "OQUIST", "BOBBI")
$numbers = @("0", "00", "1", "7", "11", "17", "71", "6", "9", "66", "69", "96", "3", "8", "38", "83", "18", "81", "2", "5", "25", "52", "4", "40", "44", "10", "13", "31", "77", "99")
$i = 0
foreach ($n in $names) {
  $num = $numbers[$i % $numbers.Count]; $sc = $schemes[$i % 4]; $fn = $fonts[$i % 2]
  $spec = @{ name = $n; number = $num; body = $sc.body; text = $sc.text; outline = $sc.outline; trim = $sc.trim; font = $fn; nameSize = $(if ($n.Length -gt 10) { 54 } else { 68 }) }
  Save (Jersey $spec) ("name$i-" + ($n -replace "[^A-Z]", "") + "-$num") @{ name = $n; number = $num; kind = "clean"; note = "$($sc.id) $fn" }
  $i++
}
# every number at least once, nameless, with both fonts
$j = 0
foreach ($num in $numbers) {
  $sc = $schemes[$j % 4]; $fn = $fonts[$j % 2]
  $spec = @{ name = ""; number = $num; body = $sc.body; text = $sc.text; outline = $sc.outline; trim = $sc.trim; font = $fn; nameSize = 68 }
  Save (Jersey $spec) ("num$j-$num") @{ name = ""; number = $num; kind = "clean-nameless"; note = "$($sc.id) $fn" }
  $j++
}
# 2. Low-contrast schemes
$k = 0
foreach ($sc in $schemes[4..6]) {
  foreach ($pair in @(@("GOGOL", "69"), @("QUINN", "8"), @("SEACH", "9"))) {
    $spec = @{ name = $pair[0]; number = $pair[1]; body = $sc.body; text = $sc.text; outline = $sc.outline; trim = $sc.trim; font = $fonts[$k % 2]; nameSize = 68 }
    Save (Jersey $spec) ("low$k-$($sc.id)-$($pair[1])") @{ name = $pair[0]; number = $pair[1]; kind = "low-contrast"; note = $sc.id }
    $k++
  }
}
# 3. Orientation: upside down and sideways, digits that flip into other digits
$o = 0
foreach ($pair in @(@("EVANOVICH", "69"), @("GOGOL", "96"), @("SEACH", "6"), @("QUINN", "9"), @("MUNN", "18"), @("LILLI", "81"), @("ZIEGLER", "11"), @("NG", "10"))) {
  foreach ($or in @("upsidedown", "left", "right")) {
    $sc = $schemes[$o % 4]
    $spec = @{ name = $pair[0]; number = $pair[1]; body = $sc.body; text = $sc.text; outline = $sc.outline; trim = $sc.trim; font = $fonts[$o % 2]; nameSize = 68 }
    Save (Orient (Jersey $spec) $or) ("orient$o-$or-$($pair[1])") @{ name = $pair[0]; number = $pair[1]; kind = "orient-$or"; note = $sc.id }
    $o++
  }
}
# 4. Sleeve numbers that differ from the back number, and a folded sleeve touching the back number
$s = 0
foreach ($t in @(@("SMITH-JONES", "4", "4", $null), @("GABBARD", "40", "40", "4"), @("O'BRIEN", "7", "7", "1"), @("MUNN", "1", "1", "7"), @("QUINN", "9", "9", "9"))) {
  $sc = $schemes[$s % 4]
  $spec = @{ name = $t[0]; number = $t[1]; sleeve = $t[2]; mergedSleeve = $t[3]; body = $sc.body; text = $sc.text; outline = $sc.outline; trim = $sc.trim; font = $fonts[$s % 2]; nameSize = 68 }
  Save (Jersey $spec) ("sleeve$s-$($t[1])") @{ name = $t[0]; number = $t[1]; kind = $(if ($t[3]) { "merged-sleeve" } else { "sleeve" }); note = "sleeve $($t[2]) beside $($t[3])" }
  $s++
}
# 5. Off-centre lone digit (really a one-digit number printed off centre — must not be a hidden digit)
foreach ($t in @(@("SEACH", "9", -120), @("EVANOVICH", "4", 110))) {
  $sc = $schemes[0]
  $spec = @{ name = $t[0]; number = $t[1]; shift = $t[2]; body = $sc.body; text = $sc.text; outline = $sc.outline; trim = $sc.trim; font = "Impact"; nameSize = 68 }
  Save (Jersey $spec) ("offcentre-$($t[1])") @{ name = $t[0]; number = $t[1]; kind = "off-centre"; note = "shift $($t[2])" }
}
# 6. Plates and patches, empty tables, a blank jersey
$p = 0
foreach ($n in @("GOGOL", "O'BRIEN", "VANDERMEULEN", "NG")) { $sc = $schemes[$p % 4]; Save (Plate @{ name = $n; number = ""; body = $sc.body; text = $sc.text; outline = $sc.outline; font = $fonts[$p % 2] }) ("plate$p") @{ name = $n; number = ""; kind = "name-plate"; note = $sc.id }; $p++ }
foreach ($n in @("6", "9", "00", "17")) { $sc = $schemes[$p % 4]; Save (Plate @{ name = ""; number = $n; body = $sc.body; text = $sc.text; outline = $sc.outline; font = $fonts[$p % 2] }) ("patch$p-$n") @{ name = ""; number = $n; kind = "number-patch"; note = $sc.id }; $p++ }
foreach ($e in @("wood", "mat", "cable", "bag")) { Save (Empty $e) ("empty-$e") @{ name = ""; number = ""; kind = "empty"; note = $e } }
$sc = $schemes[2]; Save (Jersey @{ name = ""; number = ""; body = $sc.body; text = $sc.text; outline = $sc.outline; trim = $sc.trim; font = "Impact"; nameSize = 68 }) "blank-jersey" @{ name = ""; number = ""; kind = "blank-jersey"; note = "a jersey with nothing printed yet" }

$manifest | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 (Join-Path $out "synth.json")
Write-Output ("wrote " + $manifest.Count + " frames to " + $out)
