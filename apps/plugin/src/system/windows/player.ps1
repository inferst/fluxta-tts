# The Windows Player's engine: SAPI's SpeakStream plays a WAV file on the
# system default output, one SpVoice per play. SAPI speaks asynchronously on
# a thread of its own; the loop comes round every 5 ms to see whether a play
# has started or ended.

# SpeechStreamFileMode.SSFMOpenForRead
$SSFM_OPEN_FOR_READ = 0
# SpeechVoiceSpeakFlags.SVSFlagsAsync, and with SVSFPurgeBeforeSpeak
$SVSF_ASYNC = 1
$SVSF_PURGE = 3
# SpeechRunState.SRSEIsSpeaking
$SRSE_IS_SPEAKING = 2

# Request id (as a string) -> @{ id; voice; stream; started }
$plays = @{}

function Play($request) {
  $stream = New-Object -ComObject SAPI.SpFileStream
  try {
    $stream.Open([string]$request.path, $SSFM_OPEN_FOR_READ, $false)
  } catch {
    Fail $request.id 'unavailable' ('Cannot read the synthesized audio: ' + $_.Exception.Message)
    return
  }
  $voice = New-Object -ComObject SAPI.SpVoice
  # SAPI's 0-100, set once as the play starts; 100 is the audio as it is.
  $voice.Volume = [int][Math]::Round([double]$request.volume * 100)
  try {
    $null = $voice.SpeakStream($stream, $SVSF_ASYNC)
  } catch {
    $stream.Close()
    Fail $request.id 'unavailable' ('The system default output cannot be opened: ' + $_.Exception.Message)
    return
  }
  $plays[[string]$request.id] = @{ id = $request.id; voice = $voice; stream = $stream; started = $false }
}

function Forget($key) {
  $play = $plays[$key]
  $plays.Remove($key)
  try { $play.stream.Close() } catch {}
}

function StopPlay($key) {
  $play = $plays[$key]
  if ($null -eq $play) { return }
  # Purging with nothing to say cuts off what this voice is speaking.
  try { $null = $play.voice.Speak('', $SVSF_PURGE) } catch {}
  Forget $key
}

function Step {
  foreach ($key in @($plays.Keys)) {
    $play = $plays[$key]
    $done = [bool]$play.voice.WaitUntilDone(0)
    # A sound shorter than one pass is done before it is seen speaking: it
    # still started.
    if (-not $play.started -and ($done -or $play.voice.Status.RunningState -eq $SRSE_IS_SPEAKING)) {
      $play.started = $true
      Send @{ id = $play.id; started = $true }
    }
    if ($done) {
      Forget $key
      Send @{ id = $play.id; ended = $true }
    }
  }
  $plays.Count -gt 0
}

function Receive($request) {
  switch ([string]$request.op) {
    'play' { Play $request }
    'stop' { StopPlay ([string]$request.id) }
    default { Fail $request.id 'unavailable' ('Unknown request ' + $request.op) }
  }
}

Run
