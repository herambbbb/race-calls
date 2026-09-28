import typer

app = typer.Typer(help="race-calls: timestamped race predictions from Jev.", no_args_is_help=True)


@app.callback()
def main() -> None:
    """Commands are added per task: predict, score, priors."""
