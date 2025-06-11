+++
title = "Blog"
description = "My thoughts and findings on AWS, Terraform, and cloud automation"
+++

```terminal
$ ls -l /posts/

drwxr-xr-x  .
drwxr-xr-x  ..
-rw-r--r--  welcome.md

$ cat README.txt
Welcome to my blog. Here I share my thoughts and findings on AWS, Terraform,
and all things cloud automation.

$ python3 connect_medium.py
```

```python
# Import required modules
import webbrowser
from rich import print
from rich.panel import Panel

def visit_medium():
    """Connect to my Medium blog for more cloud automation content."""
    print(Panel.fit(
        "[bold orange]🚀 Visit my Medium Blog[/bold orange]\n"
        "[dim]for more articles on AWS, Terraform, and cloud automation[/dim]",
        border_style="orange"
    ))
    webbrowser.open("https://medium.com/@bogomilroussev")

if __name__ == "__main__":
    visit_medium()
```

```terminal
$ python3 connect_medium.py
┌────────────────────────────────────────────────────────────┐
│ 🚀 Visit my Medium Blog                                    │
│ for more articles on AWS, Terraform, and cloud automation  │
└────────────────────────────────────────────────────────────┘

Connecting to Medium blog...

