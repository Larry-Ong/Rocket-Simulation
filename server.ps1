# AeroVanguard - Lightweight Local Web Server
# Serves the rocket simulation on http://localhost:8000/

$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " AeroVanguard Simulation Web Server Started" -ForegroundColor Green
Write-Host " Listening on http://localhost:$port/" -ForegroundColor White
Write-Host " Open this link in your browser to view." -ForegroundColor Cyan
Write-Host " Press Ctrl+C in this terminal window to stop." -ForegroundColor Red
Write-Host "==========================================" -ForegroundColor Cyan

try {
    $listener.Start()
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # Local routing
        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/") { 
            $urlPath = "/index.html" 
        }
        
        $localPath = Join-Path $PSScriptRoot ($urlPath.TrimStart('/'))
        
        if (Test-Path $localPath -PathType Leaf) {
            # Read file bytes
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            
            # Match Content-Type
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css" }
                ".js"   { "application/javascript" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".svg"  { "image/svg+xml" }
                ".ico"  { "image/x-icon" }
                default { "application/octet-stream" }
            }
            
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $urlPath")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.Close()
    }
} catch {
    Write-Host "Server interrupted or encountered an error: $_" -ForegroundColor Yellow
} finally {
    $listener.Stop()
    Write-Host "Web server stopped." -ForegroundColor Red
}
