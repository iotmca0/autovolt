# Voice TTS Testing Checklist

## 🧪 Testing the Enhanced TTS System

### Step 1: Connect to Chrome DevTools
```powershell
# Option 1: Use the helper script
.\debug-android.ps1

# Option 2: Manual
# 1. Open Chrome browser
# 2. Go to: chrome://inspect
# 3. Click "Inspect" next to your app
```

### Step 2: Clear Console and Test
1. In DevTools Console, click "Clear console" (or press Ctrl+L)
2. In your app, click the voice button (microphone)
3. Say a command, for example: **"Turn on light in classroom A"**

### Step 3: Look for These Logs

#### ✅ Expected Logs (in this order):

**1. Command Received:**
```
🎤 Voice command response: {success: true, message: "...", ...}
🎤 Command result: {success: true, message: "Turned on light in classroom A"}
```

**2. TTS Initialization:**
```
🔊 TTS Enabled, speaking response: Turned on light in classroom A
🔊 TTS Settings: {rate: 1, volume: 1, voice: ""}
🔊 Available voices: 50
🔊 Using default voice: Google US English
🔊 Speech queued successfully
```

**3. TTS Playback:**
```
🔊 TTS started
🔊 TTS ended
```

#### ❌ Problem Indicators:

**If you see:**
```
🔊 TTS not speaking: {ttsEnabled: false, synthAvailable: true}
```
**Solution:** TTS is disabled. Go to Voice Settings and enable it.

**If you see:**
```
🔊 Available voices: 0
```
**Solution:** Voices not loaded yet. Wait a few seconds and try again.

**If you see:**
```
🔊 TTS error: [error object]
```
**Solution:** Check the error details in console.

### Step 4: Verify Visual Feedback

While testing, you should see:

1. **During Recording:**
   - Red pulsing rings around mic button
   - Sound wave bars (5 bars)
   - "Recording..." text below button

2. **During Processing:**
   - Blue pulsing effect
   - Spinning loader icon
   - "Processing..." text below button

3. **During Speaking (NEW!):**
   - Green sound wave bars (3 bars)
   - "Speaking..." text below button in green
   - This confirms TTS is active

### Step 5: Test Different Scenarios

#### Test 1: Successful Command
```
Say: "Turn on all lights"
Expected: ✅ Success toast + Voice says the response
```

#### Test 2: Failed Command  
```
Say: "Turn on lights in room XYZ"
Expected: ❌ Error toast + Voice says error message
```

#### Test 3: Check Voice Settings
```
1. Go to Sidebar → Voice Settings
2. Verify "Text-to-Speech" switch is ON
3. Check Volume slider is not at 0
4. Try clicking "Test Voice" button
```

#### Test 4: Change TTS Settings
```
1. In Voice Settings, adjust:
   - Rate: Try 0.5x (slower) or 2.0x (faster)
   - Volume: Make sure it's at 100%
   - Voice: Try different voices
2. Test a command again
3. Voice should speak with new settings
```

### Step 6: Debugging Checklist

If TTS still doesn't work, check these in order:

- [ ] **Device volume** - Is phone volume turned up?
- [ ] **App permissions** - Does app have audio permissions?
- [ ] **TTS enabled** - Check Voice Settings page
- [ ] **TTS volume** - Check it's not set to 0 in Voice Settings
- [ ] **Browser support** - Check console for "Available voices" count > 0
- [ ] **Network** - Is command reaching backend? (Look for API request log)
- [ ] **Response format** - Does response have "success" and "message" fields?

### Step 7: Advanced Debugging

If needed, run these in DevTools Console:

```javascript
// Check if speech synthesis is available
console.log('Speech Synthesis:', window.speechSynthesis);
console.log('Voices:', window.speechSynthesis.getVoices());

// Check voice settings state
console.log('Voice Settings:', JSON.parse(localStorage.getItem('voice-settings-storage')));

// Test TTS manually
const utterance = new SpeechSynthesisUtterance('This is a test');
utterance.onstart = () => console.log('Started speaking');
utterance.onend = () => console.log('Finished speaking');
utterance.onerror = (e) => console.error('Error:', e);
window.speechSynthesis.speak(utterance);
```

### Expected Results Summary

✅ **Working Correctly:**
- You hear voice response after each command
- See 🔊 TTS logs in console
- See "Speaking..." animation with green bars
- Both success and error messages are spoken

❌ **Not Working:**
- No voice output
- Missing 🔊 logs
- No "Speaking..." animation
- Silent even though logs show TTS started

---

## 📊 Log Analysis

### Full Expected Console Output:
```
🎤 Speech recognition available: Native WebView
🔐 Attempting to create voice session...
✅ Voice session already authenticated
[User clicks mic and speaks]
🎤 Voice command response: {success: true, message: "Light turned on", ...}
🎤 Command result: {success: true, message: "Light turned on"}
🔊 TTS Enabled, speaking response: Light turned on
🔊 TTS Settings: {rate: 1, volume: 1, voice: ""}
🔊 Available voices: 50
🔊 Using default voice: Google US English
🔊 Speech queued successfully
🔊 TTS started
🔊 TTS ended
```

---

## 🔍 Common Issues & Solutions

### Issue 1: No Voice But Logs Show TTS Started
**Cause:** Phone/app volume is muted
**Solution:** 
- Check device volume buttons
- Check app volume in phone settings
- Check media volume (not ringtone volume)

### Issue 2: TTS Not Speaking (logs show ttsEnabled: false)
**Cause:** TTS disabled in settings
**Solution:**
1. Go to Voice Settings page
2. Enable "Text-to-Speech" toggle
3. Test again

### Issue 3: Available Voices: 0
**Cause:** Voices not loaded yet (common in WebView)
**Solution:**
- Wait 2-3 seconds after app launch
- Try command again
- Check if `onvoiceschanged` event fired

### Issue 4: Voice Speaks But Very Fast/Slow
**Cause:** TTS rate setting
**Solution:**
1. Go to Voice Settings
2. Adjust "Speech Rate" slider to 1.0x
3. Test again

### Issue 5: Cannot Hear on Android but Works in Browser
**Cause:** WebView audio permissions or configuration
**Solution:**
1. Check app manifest has audio permissions
2. Try reinstalling app
3. Check Android audio focus settings

---

## ✅ Success Criteria

The TTS system is working correctly when:

1. ✅ You hear spoken responses for ALL commands (success and failure)
2. ✅ Console shows complete 🔊 log sequence
3. ✅ "Speaking..." animation appears with green bars
4. ✅ Voice respects rate/volume settings from Voice Settings page
5. ✅ Test Voice button in Voice Settings works
6. ✅ Voice stops cleanly (no cutoff or overlap)

---

**Pro Tip:** Keep the Chrome DevTools console open while testing. The enhanced logging will tell you exactly where the issue is! 🎤🔊
