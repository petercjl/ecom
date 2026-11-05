// Compile with EcomUpdater.cs /main:EcomUpdate.ProcessDirectoryTestMain.
// Verify a live updater releases an inherited installation directory handle.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
namespace EcomUpdate {
  static class ProcessDirectoryTestMain {
    static object Call(string name,params object[] args) {
      return typeof(Program).GetMethod(name,BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,args);
    }
    public static int Main(string[] args) {
      if(args.Length==2&&args[0]=="child") {
        Call("ReleaseInstallationDirectory");
        File.WriteAllText(args[1],Environment.CurrentDirectory);
        Thread.Sleep(15000);return 0;
      }
      string root=Path.Combine(Path.GetTempPath(),"EcomCwdTest-"+Guid.NewGuid().ToString("N"));
      string app=Path.Combine(root,"Application"),native=Path.Combine(app,"156.1.98.0"),marker=Path.Combine(root,"ready.txt");
      Process child=null;
      try {
        Directory.CreateDirectory(native);
        var launch=(ProcessStartInfo)Call("UpdateProcess",Process.GetCurrentProcess().MainModule.FileName,"child \""+marker+"\"");
        Program.Require(launch.WorkingDirectory==Program.State&&!launch.UseShellExecute,"Worker launch context is unsafe");
        // Deliberately reproduce the browser's old inherited current directory.
        launch.WorkingDirectory=native;child=Process.Start(launch);
        var timer=Stopwatch.StartNew();while(!File.Exists(marker)&&!child.HasExited&&timer.ElapsedMilliseconds<10000)Thread.Sleep(50);
        Program.Require(File.Exists(marker)&&File.ReadAllText(marker)==Program.State,"Worker retained the installation directory");
        Directory.Move(app,app+".recovered");
        Program.Require(!child.HasExited&&Directory.Exists(app+".recovered"),"Cannot recover while updater remains alive");
        Console.WriteLine("Inherited directory released; live-worker rename and child launch context passed.");return 0;
      }catch(Exception error){Console.Error.WriteLine(error);return 1;}
      finally {if(child!=null){if(!child.HasExited)child.Kill();child.WaitForExit();child.Dispose();}if(Directory.Exists(root))Directory.Delete(root,true);}
    }
  }
}
