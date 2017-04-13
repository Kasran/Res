var ctx;
var input;
var output;
var stkCheck;

function onResetOutput(val = "---") {
  output.innerHTML = val;
}

function sanitize(str) {
  return str.replace(/</g, "&lt;");
}

function onLoad() {
  input = document.getElementById("input")
  output = document.getElementById("output");
  stkCheck = document.getElementById("stackdump");

  let log = new ResLogger(
    function(obj) {
      let str = sanitize(obj.toString());
      str = str.replace(/\n/g, "<br />");
      output.innerHTML += str;
    },
    function(obj, ctx) {
      let str = sanitize(obj.toString());
      str = str.replace(/\n/g, "<br />");
      str = '<span class="error">' + str + '</span>';
      output.innerHTML += str;
      if (stkCheck.checked) {
        let stackdump = sanitize(ctx.displayStack());
        stackdump = stackdump.replace(/\n/g, "\\n");
        output.innerHTML += "<br />" + stackdump;
      }
    }
  );

  ctx = new ResContext("", nsDefault, log);
}

function onDoRun() {
  onResetOutput("");
  ctx.reset(input.value);
  ctx.run(1000);
}

function onDoHalt() {
  ctx.complain("halted");
}
