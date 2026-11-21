"""The server of the application: accounts, the studies of each user, and computing on the HAPS.

    page ──► app (this package) ──► runner.py ──► MCP bridge ──► dry-run HAPS / HAPS
              accounts, studies       one wave     (bridge.sh)     memguess / bigdft -n NAME
              in a database

Started by ``backend/serve.py``. ``main.py`` builds the application; ``routers/``
holds one module per group of addresses; ``compute.py`` is what stands between a
study and the HAPS.
"""
