"""AI analysis pipeline: extraction -> citation validation -> clustering ->
register reconciliation -> findings. Pure functions over Pydantic models; no DB
or network access lives here (adapters inject the model call).

Import from submodules directly (e.g. ``from app.pipeline.run import
run_pipeline``) to avoid import cycles with the extraction adapters.
"""
