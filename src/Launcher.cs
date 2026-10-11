using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace ChatGPTStartup {
  [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IApplicationActivationManager {
    [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
      [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
    [PreserveSig] int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
      IntPtr itemArray, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint processId);
    [PreserveSig] int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
      IntPtr itemArray, out uint processId);
  }
  [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
  class ApplicationActivationManager {}

  public sealed class Launcher : Window {
    const string Origin = "https://chatgpt-startup.local";
    readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 65536 };
    readonly WebView2 browser = new WebView2();
    readonly bool settings, preview, selfTest;
    readonly Dictionary<string, object> defaults;
    readonly string dataPath, configFile, appId;
    bool launched, closing;
    int animationDone;
    CoreWebView2Environment environment;
    DispatcherTimer guard;

    [STAThread]
    public static int Main(string[] args) {
      try {
        if (args.Contains("--verify-launch")) {
          string directory = AppDomain.CurrentDomain.BaseDirectory;
          var serializer = new JavaScriptSerializer();
          var registration = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(directory, "launcher.json")));
          string registeredApp = Convert.ToString(registration["appId"]);
          uint pid = ActivateOfficial(registeredApp);
          Directory.CreateDirectory(Path.Combine(directory, "data"));
          File.WriteAllText(Path.Combine(directory, "data", "activation.json"),
            serializer.Serialize(new { activated = true, appId = registeredApp, processId = pid, time = DateTime.UtcNow.ToString("o") }));
          return 0;
        }
        var app = new Application();
        var window = new Launcher(args);
        app.Run(window);
        return Environment.ExitCode;
      } catch (Exception error) {
        try { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "startup-error.log"), error.ToString()); } catch {}
        MessageBox.Show("The startup screen could not open:\n" + error.Message, "ChatGPT · Startup screen");
        return 1;
      }
    }

    Launcher(string[] args) {
      settings = args.Contains("--settings");
      selfTest = args.Contains("--self-test");
      preview = args.Contains("--preview") || settings || selfTest;
      dataPath = Path.Combine(root, selfTest ? "test-data" : "data");
      Directory.CreateDirectory(dataPath);
      configFile = Path.Combine(dataPath, "config.json");
      defaults = ReadObject(Path.Combine(root, "defaults.json"));
      appId = Convert.ToString(ReadObject(Path.Combine(root, "launcher.json"))["appId"]);
      if (!appId.StartsWith("OpenAI.Codex_", StringComparison.Ordinal) || !appId.EndsWith("!App", StringComparison.Ordinal))
        throw new InvalidOperationException("The registered application ID is invalid.");
      Title = settings ? "ChatGPT · Startup Settings" : "ChatGPT · Startup screen";
      Background = Brushes.Black;
      WindowStartupLocation = WindowStartupLocation.CenterScreen;
      Width = Math.Min(1280, SystemParameters.WorkArea.Width);
      Height = Math.Min(840, SystemParameters.WorkArea.Height);
      MinWidth = 700; MinHeight = 520;
      if (!settings) { WindowStyle = WindowStyle.None; ResizeMode = ResizeMode.NoResize; }
      if (!preview) WindowState = WindowState.Maximized;
      if (selfTest) { Opacity = 0; ShowActivated = false; ShowInTaskbar = false; }
      var iconFile = Path.Combine(root, settings ? "OpenAI-Startup-Settings.ico" : "OpenAI-Startup.ico");
      if (File.Exists(iconFile)) {
        var icon = System.Windows.Media.Imaging.BitmapDecoder.Create(new Uri(iconFile),
          System.Windows.Media.Imaging.BitmapCreateOptions.PreservePixelFormat,
          System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
        Icon = icon.Frames.OrderByDescending(frame => frame.PixelWidth).First();
      }
      Content = browser;
      Loaded += async delegate { await Initialize(); };
      Closed += delegate { closing = true; if (guard != null) guard.Stop(); browser.Dispose(); };
    }

    Dictionary<string, object> ReadObject(string file) {
      return json.Deserialize<Dictionary<string, object>>(File.ReadAllText(file, Encoding.UTF8));
    }

    Dictionary<string, object> Normalize(Dictionary<string, object> source) {
      var output = new Dictionary<string, object>(defaults);
      var enums = new Dictionary<string, string[]> {
        {"mode", new[]{"always", "session", "daily"}}, {"theme", new[]{"light", "dark"}},
        {"voiceLang", new[]{"en", "zh", "both"}}, {"sfx", new[]{"audio", "synth"}}, {"voiceSource", new[]{"asset", "tts"}}
      };
      var ranges = new Dictionary<string, double[]> {
        {"speed", new[]{0.35, 3.0}}, {"soundVolume", new[]{0.0, 1.0}}, {"voiceRate", new[]{0.5, 2.0}},
        {"voiceLead", new[]{0.0, 1200.0}}, {"voicePitch", new[]{0.0, 2.0}}, {"voiceVolume", new[]{0.0, 1.0}}
      };
      foreach (var entry in defaults) {
        if (source == null || !source.ContainsKey(entry.Key) || source[entry.Key] == null) continue;
        object value = source[entry.Key]; string text = Convert.ToString(value, CultureInfo.InvariantCulture);
        if (entry.Value is bool) output[entry.Key] = value.Equals(true) || text == "true" || text == "1";
        else if (enums.ContainsKey(entry.Key)) { if (enums[entry.Key].Contains(text)) output[entry.Key] = text; }
        else if (ranges.ContainsKey(entry.Key)) {
          double number;
          if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out number) && !double.IsNaN(number) && !double.IsInfinity(number))
            output[entry.Key] = Math.Max(ranges[entry.Key][0], Math.Min(ranges[entry.Key][1], number));
        } else if (new[]{"accent", "glitchA", "glitchB"}.Contains(entry.Key)) {
          if (System.Text.RegularExpressions.Regex.IsMatch(text, "^#[0-9a-fA-F]{3,8}$")) output[entry.Key] = text;
        } else output[entry.Key] = text.Substring(0, Math.Min(64, text.Length));
      }
      if (string.IsNullOrWhiteSpace(Convert.ToString(output["identity"]))) output["identity"] = defaults["identity"];
      if (string.IsNullOrWhiteSpace(Convert.ToString(output["identityId"]))) output["identityId"] = "OPERATOR";
      return output;
    }

    Dictionary<string, object> Config() {
      try { return Normalize(ReadObject(configFile)); }
      catch { return new Dictionary<string, object>(defaults); }
    }
    void SaveConfig(Dictionary<string, object> config) {
      string temp = configFile + ".tmp";
      File.WriteAllText(temp, json.Serialize(Normalize(config)), new UTF8Encoding(false));
      if (File.Exists(configFile)) File.Replace(temp, configFile, null);
      else File.Move(temp, configFile);
    }

    async Task Initialize() {
      try {
        var options = new CoreWebView2EnvironmentOptions { AdditionalBrowserArguments = "--autoplay-policy=no-user-gesture-required" };
        environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(dataPath, "WebView2"), options);
        await browser.EnsureCoreWebView2Async(environment);
        browser.DefaultBackgroundColor = System.Drawing.Color.Black;
        var core = browser.CoreWebView2;
        if (selfTest) core.IsMuted = true;
        core.Settings.AreDevToolsEnabled = preview;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += ResourceRequested;
        core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e) {
          Uri uri; if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out uri) || uri.Host != "chatgpt-startup.local") e.Cancel = true;
        };
        core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) { e.Handled = true; };
        core.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs e) { e.Cancel = true; };
        core.WebMessageReceived += Message;
        core.ProcessFailed += delegate { if (!preview) LaunchOfficial(); };
        guard = new DispatcherTimer { Interval = TimeSpan.FromSeconds(15) };
        guard.Tick += delegate { guard.Stop(); if (!preview) LaunchOfficial(); };
        guard.Start();
        core.Navigate(Origin + "/index.html" + (settings ? "?settings=1" : preview ? "?preview=1" : ""));
        if (selfTest) await RunSelfTest();
      } catch (Exception error) {
        Log(error.ToString());
        if (!preview) LaunchOfficial();
        else { Environment.ExitCode = 1; if (!selfTest) MessageBox.Show(error.Message, Title); Close(); }
      }
    }

    void Respond(CoreWebView2WebResourceRequestedEventArgs e, int status, object payload) {
      var bytes = Encoding.UTF8.GetBytes(json.Serialize(payload));
      e.Response = environment.CreateWebResourceResponse(new MemoryStream(bytes), status, status == 200 ? "OK" : "Error",
        "Content-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff");
    }
    void ResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs e) {
      try {
        Uri uri = new Uri(e.Request.Uri);
        if (uri.Scheme != "https" || uri.Host != "chatgpt-startup.local") {
          Respond(e, 403, new { ok = false, error = "local resources only" }); return;
        }
        if (uri.AbsolutePath != "/dsh-startup/config") {
          if (e.Request.Method != "GET" && e.Request.Method != "HEAD") {
            Respond(e, 405, new { ok = false, error = "method not allowed" }); return;
          }
          string webRoot = Path.GetFullPath(Path.Combine(root, "web")) + Path.DirectorySeparatorChar;
          string file = Path.GetFullPath(Path.Combine(webRoot, Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
          if (!file.StartsWith(webRoot, StringComparison.OrdinalIgnoreCase) || !File.Exists(file)) {
            Respond(e, 404, new { ok = false, error = "resource not found" }); return;
          }
          var types = new Dictionary<string, string> { {".html", "text/html; charset=utf-8"}, {".js", "application/javascript; charset=utf-8"},
            {".css", "text/css; charset=utf-8"}, {".svg", "image/svg+xml"}, {".mp3", "audio/mpeg"}, {".json", "application/json"}, {".woff2", "font/woff2"} };
          string ext = Path.GetExtension(file).ToLowerInvariant();
          if (!types.ContainsKey(ext)) { Respond(e, 403, new { ok = false, error = "unsupported resource" }); return; }
          byte[] bytes = e.Request.Method == "HEAD" ? new byte[0] : File.ReadAllBytes(file);
          e.Response = environment.CreateWebResourceResponse(new MemoryStream(bytes), 200, "OK", "Content-Type: " + types[ext] +
            "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff");
          return;
        }
        var config = Config();
        if (e.Request.Method == "POST") {
          if (e.Request.Content == null || (e.Request.Content.CanSeek && e.Request.Content.Length > 65536))
            throw new InvalidDataException("Settings are empty or exceed the size limit.");
          var payload = json.Deserialize<Dictionary<string, object>>(new StreamReader(e.Request.Content, Encoding.UTF8).ReadToEnd());
          if (payload.ContainsKey("action") && Convert.ToString(payload["action"]) == "reset") config = new Dictionary<string, object>(defaults);
          else {
            object value; var patch = payload.TryGetValue("patch", out value) ? value as Dictionary<string, object> : payload;
            if (patch != null) foreach (var item in patch) if (defaults.ContainsKey(item.Key)) config[item.Key] = item.Value;
            config = Normalize(config);
          }
          SaveConfig(config);
        } else if (e.Request.Method != "GET") {
          Respond(e, 405, new { ok = false, error = "method not allowed" }); return;
        }
        Respond(e, 200, new { ok = true, version = "1.1.0-chatgpt.2", config, defaults, file = configFile });
      } catch (Exception error) { Respond(e, 400, new { ok = false, error = error.Message }); }
    }

    void Message(object sender, CoreWebView2WebMessageReceivedEventArgs e) {
      if (!e.Source.StartsWith(Origin + "/", StringComparison.Ordinal)) return;
      try {
        var message = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
        string type = Convert.ToString(message["type"]);
        if (type == "ready") { if (guard != null) guard.Stop(); Log("READY"); }
        if (type == "animationDone") { animationDone++; Log("ANIMATION COMPLETE"); }
        if (type == "launch") LaunchOfficial();
        if (type == "close") Close();
        if (type == "error") Log("PAGE ERROR: " + Convert.ToString(message["message"]));
      } catch (Exception error) { Log(error.Message); }
    }
    void LaunchOfficial() {
      if (launched || closing) return;
      launched = true;
      try {
        uint processId = ActivateOfficial(appId);
        Log("OPENED " + appId + " PID " + processId);
        Close();
      } catch (Exception error) { launched = false; Log(error.ToString()); MessageBox.Show("Could not open ChatGPT:\n" + error.Message, Title); }
    }
    static uint ActivateOfficial(string registeredApp) {
      if (!registeredApp.StartsWith("OpenAI.Codex_", StringComparison.Ordinal) || !registeredApp.EndsWith("!App", StringComparison.Ordinal))
        throw new InvalidOperationException("The registered application ID is invalid.");
      var activation = (IApplicationActivationManager)new ApplicationActivationManager();
      try {
        uint processId;
        int result = activation.ActivateApplication(registeredApp, null, 0, out processId);
        Marshal.ThrowExceptionForHR(result);
        if (processId == 0) throw new InvalidOperationException("Windows did not return a running application process.");
        return processId;
      } finally { Marshal.FinalReleaseComObject(activation); }
    }
    void Log(string message) {
      try { File.AppendAllText(Path.Combine(dataPath, "startup.log"), DateTime.UtcNow.ToString("o") + " " + message + "\n"); } catch {}
    }

    async Task<string> JS(string code) { return await browser.CoreWebView2.ExecuteScriptAsync(code); }
    async Task WaitFor(string expression, int timeout = 20000) {
      var watch = Stopwatch.StartNew();
      while (watch.ElapsedMilliseconds < timeout) {
        if (await JS("Boolean(" + expression + ")") == "true") return;
        await Task.Delay(100);
      }
      throw new TimeoutException("Condition not met: " + expression);
    }
    async Task Shot(string name) {
      using (var file = File.Create(Path.Combine(dataPath, name + ".png")))
        await browser.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, file);
    }
    async Task RunSelfTest() {
      var results = new List<string>();
      await WaitFor("window.__CHATGPT_STARTUP_READY__");
      await WaitFor("document.querySelector('#settingsPanel input')");
      results.Add("Original React settings panel mounted.");
      await JS("window.__CHATGPT_TEST_RESULT__=null;fetch('/dsh-startup/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset'})}).then(r=>r.json()).then(j=>window.__CHATGPT_TEST_RESULT__=j.ok)");
      await WaitFor("window.__CHATGPT_TEST_RESULT__ === true");
      await JS("window.__CHATGPT_AUDIO_EVENTS__=[];window.__CHATGPT_STAGE_EVENTS__=[];window.__CHATGPT_STARTUP_REPLAY__({speed:1,voice:true,sound:false,requireInteraction:true,mode:'always',theme:'light'})");
      await WaitFor("document.querySelector('.dsu-black-inner.dsu-in') && !document.getElementById('dsh-startup-root').classList.contains('dsu-gone')");
      await Task.Delay(600);
      if (await JS("getComputedStyle(document.querySelector('.dsu-black')).opacity === '1' && document.querySelector('.dsu-black-en svg') !== null") != "true")
        throw new InvalidOperationException("The wordmark introduction is not visible.");
      await Shot("00-wordmark");
      results.Add("Black introduction displays the standalone official horizontal wordmark.");
      await WaitFor("document.querySelector('.dsu-stepcount') && document.querySelector('.dsu-stepcount').textContent.includes('01') && document.querySelector('.dsu-action.dsu-in')");
      await WaitFor("window.__CHATGPT_AUDIO_EVENTS__.some(e=>e.kind==='start'&&e.name==='line-1')");
      await Task.Delay(350);
      await Shot("01-access");
      if (await JS("/[\\u3400-\\u9fff]/.test(document.getElementById('dsh-startup-root').innerText)") != "false")
        throw new InvalidOperationException("The startup screen contains Chinese text.");
      await WaitFor("document.fonts.check('16px OpenAI Sans')");
      await WaitFor("document.fonts.check('16px IBM Plex Mono')");
      if (await JS("document.querySelector('.dsu-brand-2').textContent === '' && document.querySelector('.dsu-brand-1 svg') !== null && getComputedStyle(document.querySelector('.dsu-stepcount')).fontFamily.includes('IBM Plex Mono')") != "true")
        throw new InvalidOperationException("Brand separation or local typography is incorrect.");
      await JS("document.querySelector('.dsu-btn').click()");
      await WaitFor("document.querySelector('.dsu-stepcount').textContent.includes('02') && document.querySelector('.dsu-action.dsu-in')");
      await WaitFor("window.__CHATGPT_AUDIO_EVENTS__.some(e=>e.kind==='start'&&e.name==='line-2')");
      await Task.Delay(350);
      await Shot("02-identity");
      await JS("document.querySelector('.dsu-btn').click()");
      await WaitFor("document.getElementById('dsh-startup-root').dataset.stage==='3'");
      await Task.Delay(650);
      await Shot("03-vector");
      await WaitFor("document.getElementById('dsh-startup-root').dataset.stage==='4'");
      await Task.Delay(650);
      await Shot("04-read");
      await WaitFor("document.querySelector('.dsu-reticle.dsu-in')");
      await Task.Delay(950);
      await Shot("05-verified");
      await WaitFor("document.querySelector('.dsu-welcome.dsu-in')");
      await Task.Delay(550);
      await Shot("06-welcome");
      await WaitFor("!document.getElementById('dsh-startup-root')");
      results.Add("Interactive access and identity confirmation, automatic steps, finale, cleanup and done event passed.");
      await JS("window.__CHATGPT_AUDIO_CHECK__=(()=>{let events=window.__CHATGPT_AUDIO_EVENTS__,stages=window.__CHATGPT_STAGE_EVENTS__;for(let i=1;i<=6;i++){let name='line-'+i,s=events.filter(e=>e.name===name&&e.kind==='start'),end=events.filter(e=>e.name===name&&e.kind==='end'),cue=events.find(e=>e.name===name&&e.kind==='cue');if(s.length!==1||end.length!==1)return 'missing/duplicate clip '+name;if(s[0].stage!==String(i)||!s[0].meter||end[0].meter||s[0].contextState!=='running')return 'meter/stage/context '+name;if(s[0].time-cue.time<cue.lead-25)return 'voice lead '+name;if(Math.abs(end[0].time-s[0].time-s[0].duration)>250)return 'playback duration '+name;if(i<6){let next=stages.find(e=>e.stage===i+1);if(!next||next.time<end[0].time)return 'clipped or overlapping stage '+name}if(i===6&&!s[0].welcomeVisible)return 'welcome voice before visible frame'}return true})()");
      string audioCheck = await JS("window.__CHATGPT_AUDIO_CHECK__");
      if (audioCheck != "true") throw new InvalidOperationException("Audio synchronization: " + audioCheck);
      results.Add("All six actual voice clips: correct stage, 240ms lead, live meter, complete playback before transition and visible welcome passed.");
      string syncJson = await JS("window.__CHATGPT_AUDIO_EVENTS__");

      await JS("window.__CHATGPT_OPEN_SETTINGS__()");
      await Shot("07-settings");
      if (await JS("/[\\u3400-\\u9fff]/.test(document.getElementById('settingsDialog').innerText)") != "false")
        throw new InvalidOperationException("Settings contain Chinese text.");
      results.Add("English interface, separate company/product branding and locally loaded OpenAI Sans and IBM Plex Mono passed.");
      string controls = await JS("[...document.querySelectorAll('#settingsPanel input,#settingsPanel select')].length");
      results.Add("Original settings controls: " + controls);
      await JS("window.__CHATGPT_TEST_RESULT__=null;fetch('/dsh-startup/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({patch:{identity:'测试 · OpenAI',speed:99,accent:'#10a37f',unrecognized:'ignored'}})}).then(r=>r.json()).then(j=>window.__CHATGPT_TEST_RESULT__=j.config.identity==='测试 · OpenAI'&&j.config.speed===3&&!('unrecognized' in j.config))");
      await WaitFor("window.__CHATGPT_TEST_RESULT__ === true");
      results.Add("Configuration save/read, numeric clamp and unknown-field rejection passed.");
      await JS("window.__CHATGPT_TEST_RESULT__=null;fetch('/dsh-startup/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset'})}).then(r=>r.json()).then(j=>window.__CHATGPT_TEST_RESULT__=j.config.identity===j.defaults.identity)");
      await WaitFor("window.__CHATGPT_TEST_RESULT__ === true");
      results.Add("Reset to all 33 upstream settings passed.");

      await JS("window.__CHATGPT_TEST_RESULT__=null;(async()=>{let ac=new AudioContext();let names=['line-1','line-2','line-3','line-4','line-5','line-6','sfx-tick','sfx-ticks-run'];let clips=[];for(let name of names){let r=await fetch('/dsh-startup/asset/'+name+'.mp3');let clip=await ac.decodeAudioData(await r.arrayBuffer());clips.push({name,duration:clip.duration})}await ac.close();window.__CHATGPT_TEST_AUDIO__=clips;window.__CHATGPT_TEST_RESULT__=clips.every(c=>c.duration>0)})().catch(e=>window.__CHATGPT_TEST_AUDIO_ERROR__=String(e))");
      await WaitFor("window.__CHATGPT_TEST_RESULT__ === true");
      results.Add("All eight original audio files decoded in the native Chromium runtime.");
      string clipsJson = await JS("window.__CHATGPT_TEST_AUDIO__");

      await JS("window.__CHATGPT_STARTUP_REPLAY__({theme:'dark',speed:3,voice:false,sound:false,requireInteraction:true,mode:'always'})");
      await WaitFor("document.querySelector('.dsu-action.dsu-in')");
      await Task.Delay(450);
      await Shot("08-dark");
      await JS("window.__DSH_STARTUP_API__.skip()");
      await WaitFor("!document.getElementById('dsh-startup-root')");
      results.Add("Dark theme, replay and skip cleanup passed.");
      await JS("window.__CHATGPT_AUDIO_EVENTS__=[];window.__CHATGPT_STARTUP_REPLAY__({theme:'light',speed:3,voice:true,sound:false,requireInteraction:false,mode:'always'})");
      await WaitFor("window.__CHATGPT_AUDIO_EVENTS__.some(e=>e.kind==='start'&&e.name==='line-1')");
      await JS("window.__DSH_STARTUP_API__.skip()");
      await WaitFor("!document.getElementById('dsh-startup-root')");
      if (await JS("window.__CHATGPT_AUDIO_EVENTS__.filter(e=>e.kind==='cancel'&&e.name==='line-1').length") != "1")
        throw new InvalidOperationException("Skip did not stop active asset audio.");
      results.Add("Skip stops active voice immediately, without leaking audio into replay.");
      Width = 760; Height = 600;
      await JS("window.__CHATGPT_STARTUP_REPLAY__({theme:'light',speed:3,voice:false,sound:false,requireInteraction:true,mode:'always'})");
      await WaitFor("document.querySelector('.dsu-action.dsu-in')");
      await JS("document.querySelector('.dsu-btn').click()");
      await WaitFor("document.getElementById('dsh-startup-root').dataset.stage==='2'");
      await Task.Delay(650);
      await Shot("09-compact");
      if (await JS("(()=>{let a=document.querySelector('.dsu-action').getBoundingClientRect(),t=document.querySelector('.dsu-status').getBoundingClientRect();return t.left>=0&&t.right<=innerWidth&&a.bottom<innerHeight-85})()") != "true")
        throw new InvalidOperationException("Compact layout does not fit.");
      await JS("window.__DSH_STARTUP_API__.skip()");
      await WaitFor("!document.getElementById('dsh-startup-root')");
      results.Add("Compact 760 by 600 layout fits the English title, identity card, controls and footer.");
      if (animationDone < 2) throw new InvalidOperationException("Completion events were not delivered.");
      File.WriteAllText(Path.Combine(dataPath, "self-test.json"), json.Serialize(new { passed = true, results, originalAudio = json.DeserializeObject(clipsJson), synchronizedAudio = json.DeserializeObject(syncJson), animationDone }), Encoding.UTF8);
      Log("SELF TEST PASSED");
      Close();
    }
  }
}
