<#
.SYNOPSIS
  Sets up the separate release repository of colautool (docs/integration/rust/release.md#repo-phát-hành-riêng).

.DESCRIPTION
  Steps, each one safe to run again:
    (no switch)    create the public repository colautool-releases with a README, then show what is still missing
    -SetSecret     store a fine-grained token (Contents: Read and write on colautool-releases) as the secret
                   RELEASE_TOKEN of the code repository; needs the GitHub CLI (gh). With -UseCurrentToken, the admin
                   token below is stored instead, after a warning (a classic token opens every repository)
    -SetVariable   set the variable RELEASE_REPO of the code repository: from then on, release.yml publishes to
                   colautool-releases. Run it only after the last release published to the code repository
    -CleanRemote   remove the token from the URL of the git remote "origin" (git asks for credentials afterwards)
    -Check         only show the state, change nothing

  The admin token comes from -Token, else $env:GITHUB_TOKEN, else the URL of the remote "origin". It is never printed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .github\scripts\setup-release-repo.ps1
  powershell -ExecutionPolicy Bypass -File .github\scripts\setup-release-repo.ps1 -SetSecret
  powershell -ExecutionPolicy Bypass -File .github\scripts\setup-release-repo.ps1 -SetVariable
#>
param(
  [string]$Owner = 'dactiennguyen',
  [string]$CodeRepo = 'co-lau-loan-the-tool',
  [string]$ReleaseRepo = 'colautool-releases',
  [string]$Token,
  [switch]$SetSecret,
  [switch]$UseCurrentToken,
  [switch]$SetVariable,
  [switch]$CleanRemote,
  [switch]$Check
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$code = "$Owner/$CodeRepo"
$release = "$Owner/$ReleaseRepo"

function Get-AdminToken {
  if ($Token) { return $Token }
  if ($env:GITHUB_TOKEN) { return $env:GITHUB_TOKEN }
  $url = git remote get-url origin 2>$null
  if ($url -match '^https://([^@/]+)@github\.com/') { return $Matches[1] }
  $secure = Read-Host 'GitHub token (repo scope)' -AsSecureString
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

$admin = Get-AdminToken
$headers = @{ Authorization = "token $admin"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28'; 'User-Agent' = 'setup-release-repo' }

# GitHub REST call; returns $null on 404 instead of throwing.
function Invoke-GitHub([string]$Method, [string]$Path, $Body) {
  $req = @{ Method = $Method; Uri = "https://api.github.com$Path"; Headers = $headers }
  if ($null -ne $Body) {
    $req.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
    $req.ContentType = 'application/json; charset=utf-8'
  }
  try { return Invoke-RestMethod @req }
  catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 404) { return $null }
    throw "GitHub $Method $Path failed ($status): $($_.ErrorDetails.Message)"
  }
}

function Show-State {
  $r = Invoke-GitHub GET "/repos/$release"
  $s = Invoke-GitHub GET "/repos/$code/actions/secrets/RELEASE_TOKEN"
  $v = Invoke-GitHub GET "/repos/$code/actions/variables/RELEASE_REPO"
  Write-Host ''
  Write-Host "Repo $release : $(if ($r) { "có ($(if ($r.private) { 'private' } else { 'public' })) $($r.html_url)" } else { 'CHƯA CÓ' })"
  Write-Host "Secret RELEASE_TOKEN của $code : $(if ($s) { 'có' } else { 'chưa có  -> chạy lại với -SetSecret' })"
  Write-Host "Variable RELEASE_REPO của $code : $(if ($v) { $v.value } else { 'chưa đặt  -> release.yml vẫn phát hành vào repo code; đặt bằng -SetVariable sau bản chuyển tiếp' })"
  $url = git remote get-url origin 2>$null
  if ($url -match '^https://[^@/]+@github\.com/') { Write-Host 'Remote origin còn chứa token  -> chạy lại với -CleanRemote, rồi thu hồi token trên GitHub' }
}

$user = Invoke-GitHub GET '/user'
Write-Host "Token của: $($user.login)"
if ($Check) { Show-State; exit 0 }

# 1. The public release repository, with a README so that tags can be created on its default branch.
if (Invoke-GitHub GET "/repos/$release") {
  Write-Host "Repo $release đã có, bỏ qua."
} else {
  $body = @{ name = $ReleaseRepo; description = 'Releases of colautool: installers and latest.json for the in-app updater'; private = $false; auto_init = $true; has_issues = $false; has_wiki = $false; has_projects = $false }
  $created = if ($user.login -eq $Owner) { Invoke-GitHub POST '/user/repos' $body } else { Invoke-GitHub POST "/orgs/$Owner/repos" $body }
  Write-Host "Đã tạo $($created.html_url)"
}

# 2. RELEASE_TOKEN: secrets are encrypted with the repository's public key (libsodium), which gh does.
if ($SetSecret) {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "Cần GitHub CLI (winget install GitHub.cli), hoặc đặt tay: https://github.com/$code/settings/secrets/actions/new (tên RELEASE_TOKEN)"
  }
  if ($UseCurrentToken) {
    $plain = $admin
  } else {
    Write-Host "Tạo token tại https://github.com/settings/personal-access-tokens/new : Repository access = Only select repositories -> $release ; Permissions -> Contents = Read and write"
    $secure = Read-Host 'Dán token' -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  }
  # A classic token (ghp_) works too, but it opens every repository of the account to whoever reads the secret.
  if (-not $plain.StartsWith('github_pat_')) {
    Write-Host 'CẢNH BÁO: đây là token classic, có quyền trên mọi repo của tài khoản. Thu hồi nó thì bản phát hành cũng hỏng, phải đặt lại secret.' -ForegroundColor Yellow
    if ((Read-Host 'Vẫn lưu token này làm RELEASE_TOKEN? (y/N)') -ne 'y') { throw 'Đã huỷ.' }
  }
  $previous = $env:GH_TOKEN
  try { $env:GH_TOKEN = $admin; $plain | gh secret set RELEASE_TOKEN --repo $code; if ($LASTEXITCODE) { throw 'gh secret set thất bại' } }
  finally { $env:GH_TOKEN = $previous }
  Write-Host "Đã lưu secret RELEASE_TOKEN cho $code"
}

# 3. RELEASE_REPO: switches release.yml to the release repository.
if ($SetVariable) {
  if (-not (Invoke-GitHub GET "/repos/$code/actions/secrets/RELEASE_TOKEN")) { throw 'Chưa có secret RELEASE_TOKEN: chạy -SetSecret trước, nếu không release.yml sẽ dừng ở bước phát hành.' }
  if (Invoke-GitHub GET "/repos/$code/actions/variables/RELEASE_REPO") {
    Invoke-GitHub PATCH "/repos/$code/actions/variables/RELEASE_REPO" @{ name = 'RELEASE_REPO'; value = $release } | Out-Null
  } else {
    Invoke-GitHub POST "/repos/$code/actions/variables" @{ name = 'RELEASE_REPO'; value = $release } | Out-Null
  }
  Write-Host "Đã đặt RELEASE_REPO = $release : các tag v* sau sẽ phát hành vào repo này"
}

# 4. The remote URL without the token.
if ($CleanRemote) {
  git remote set-url origin "https://github.com/$code.git"
  Write-Host "Remote origin = https://github.com/$code.git (lần push sau git hỏi đăng nhập; nhớ thu hồi token cũ trên GitHub)"
}

Show-State
