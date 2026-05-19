## Pre-process
### Install `papermill` to run the notebook with overriding the variable value
```bash
pip install papermill
```

### Run the notebook as a script
Take note of the two notebooks. The second one contains the overridden variable. In this case, we edited the original notebook. You may input a notebook to create a new one containing the overridden variable.

```bash
papermill public/scripts/preprocess.ipynb \
    public/scripts/preprocess.ipynb \
    -p filename "1h"

```

```bash
npm run build
```

```bash
npm start
```

## Render User-guide as PDF

```
sudo apt install fonts-inter

sudo apt install texlive-xetex texlive-fonts-recommended texlive-latex-recommended

xelatex --version
```

```
quarto render Userguide.qmd --to pdf
```