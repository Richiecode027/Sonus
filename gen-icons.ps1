# Genera los iconos PNG de Sonus con System.Drawing.
Add-Type -AssemblyName System.Drawing

function New-Icon {
    param([int]$Size, [string]$Path, [bool]$Maskable)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(22, 25, 32), [System.Drawing.Color]::FromArgb(10, 12, 16), [single]45)

    if ($Maskable) {
        $g.FillRectangle($bg, $rect)
    } else {
        $r = [int]($Size * 0.22)
        $d = $r * 2
        $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
        $gp.AddArc(0, 0, $d, $d, 180, 90)
        $gp.AddArc($Size - $d, 0, $d, $d, 270, 90)
        $gp.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
        $gp.AddArc(0, $Size - $d, $d, $d, 90, 90)
        $gp.CloseFigure()
        $g.FillPath($bg, $gp)
    }

    $accent = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255, 211, 106), [System.Drawing.Color]::FromArgb(90, 209, 168), [single]30)

    $inset = [int]($Size * 0.14)
    if (-not $Maskable) {
        $ringPen = New-Object System.Drawing.Pen($accent, [single]($Size * 0.02))
        $g.DrawEllipse($ringPen, $inset, $inset, $Size - 2 * $inset, $Size - 2 * $inset)
    }

    $margin = $Size * 0.27
    $amp = $Size * 0.13
    $cy = $Size / 2.0
    $startX = $margin
    $endX = $Size - $margin
    $pts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    for ($i = 0; $i -le 120; $i++) {
        $t = $i / 120.0
        $x = $startX + ($endX - $startX) * $t
        $y = $cy - $amp * [math]::Sin($t * 2.2 * 2 * [math]::PI)
        $pts.Add((New-Object System.Drawing.PointF([single]$x, [single]$y)))
    }
    $wavePen = New-Object System.Drawing.Pen($accent, [single]($Size * 0.05))
    $wavePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $wavePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawCurve($wavePen, $pts.ToArray())

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output "  -> $Path"
}

$dir = Join-Path $PSScriptRoot 'icons'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

New-Icon -Size 192 -Path (Join-Path $dir 'icon-192.png') -Maskable $false
New-Icon -Size 512 -Path (Join-Path $dir 'icon-512.png') -Maskable $false
New-Icon -Size 512 -Path (Join-Path $dir 'icon-maskable-512.png') -Maskable $true
Write-Output "Iconos generados."
