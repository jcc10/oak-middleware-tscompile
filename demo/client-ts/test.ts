/// <reference lib="es2020" />
/// <reference lib="dom" />
/// <reference lib="webworker.importscripts" />
/// <reference lib="scripthost" />
/// <reference lib="dom.iterable" />
/// <reference no-default-lib="true"/>

let test = document.getElementById("test");
if(test)
    test.innerHTML = "It Works!";