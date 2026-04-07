# Test video upload to diagnose hanging issue

$url = "http://localhost:4000/api/routes/videos/upload-file"
$testVideoPath = "D:\NNPD\gleam-watch-zone-main\gleam-watch-zone-main\test-video.mp4"

# Create a small test video (5 seconds of black frames using raw video data)
Write-Host "Creating test video file..."
$testContentSize = 1024 * 100  # 100KB test file
$testContent = New-Object byte[] $testContentSize
[System.Random]::new().NextBytes($testContent)
[System.IO.File]::WriteAllBytes($testVideoPath, $testContent)
Write-Host "Test video created: $testVideoPath ($(($testContent.Length / 1024).ToString('F2'))KB)"

# Test upload with timeout
Write-Host "`nTesting upload endpoint..."
Write-Host "URL: $url"
Write-Host "Starting upload at $(Get-Date -Format 'HH:mm:ss.fff')"

$startTime = [DateTime]::UtcNow
$timeout = 30  # 30 second timeout to match backend

try {
    $form = New-Object System.Net.Http.MultipartFormDataContent
    $fileStream = [System.IO.File]::OpenRead($testVideoPath)
    $fileContent = New-Object System.Net.Http.StreamContent($fileStream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("video/mp4")
    $form.Add($fileContent, "file", "test-video.mp4")
    
    # Add metadata
    $form.Add([System.Net.Http.StringContent]::new("Test Video"), "title")
    $form.Add([System.Net.Http.StringContent]::new("This is a test video"), "description")
    
    $httpClient = New-Object System.Net.Http.HttpClient
    $httpClient.Timeout = [TimeSpan]::FromSeconds($timeout)
    
    $response = $httpClient.PostAsync($url, $form).Result
    $elapsed = [DateTime]::UtcNow - $startTime
    
    Write-Host "Upload completed at $(Get-Date -Format 'HH:mm:ss.fff')"
    Write-Host "Status: $($response.StatusCode)"
    Write-Host "Elapsed time: $($elapsed.TotalSeconds)s"
    
    $responseBody = $response.Content.ReadAsStringAsync().Result
    Write-Host "Response: $responseBody"
    
} catch {
    $elapsed = [DateTime]::UtcNow - $startTime
    Write-Host "Upload failed at $(Get-Date -Format 'HH:mm:ss.fff')"
    Write-Host "Elapsed time: $($elapsed.TotalSeconds)s"
    Write-Host "Error: $_"
}

# Clean up
Write-Host "`nCleaning up..."
Remove-Item $testVideoPath -Force -ErrorAction SilentlyContinue
Write-Host "Test complete."
