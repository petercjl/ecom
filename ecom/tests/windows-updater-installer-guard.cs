// Compile with EcomUpdater.cs twice: a harmless EcomSetup.exe fixture and the
// guard test. No installer, application directory or Profile is modified.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
namespace EcomUpdate {
  static class InstallerGuardFixtureMain {
    public static int Main(){Thread.Sleep(30000);return 0;}
  }
  static class InstallerGuardTestMain {
    static void Check() {
      typeof(Program).GetMethod("EnsureNoInstaller",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[0]);
    }
    public static int Main(string[] args) {
      Process fixture=null;
      try {
        Program.Require(args.Length==1&&Path.GetFileName(args[0])=="EcomSetup.exe","Supply the owned installer-name fixture");
        Check();fixture=Process.Start(new ProcessStartInfo(args[0]){UseShellExecute=false});
        Thread.Sleep(200);Program.Require(!fixture.HasExited&&fixture.ProcessName=="EcomSetup","Fixture did not start");
        bool refused=false;try{Check();}catch(TargetInvocationException e){refused=e.InnerException is InvalidDataException;}
        Program.Require(refused,"Recovery permitted while the named installer was alive");
        fixture.Kill();fixture.WaitForExit();Check();
        Console.WriteLine("Installer guard passed: live EcomSetup refused; exited fixture permits recovery.");return 0;
      }catch(Exception e){Console.Error.WriteLine(e);return 1;}
      finally{if(fixture!=null){if(!fixture.HasExited){fixture.Kill();fixture.WaitForExit();}fixture.Dispose();}}
    }
  }
}
