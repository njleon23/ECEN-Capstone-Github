"""Create an account from a trusted backend terminal."""

import argparse
from getpass import getpass

from app.services.user_repository import (
    UsernameAlreadyExistsError,
    UserRepositoryError,
    create_user,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a Council Brief user account."
    )
    parser.add_argument("--username", required=True)
    parser.add_argument("--display-name", required=True)
    parser.add_argument(
        "--role",
        choices=["admin", "reviewer"],
        default="reviewer",
    )
    arguments = parser.parse_args()

    try:
        password = getpass("Password (15–128 characters): ")
        confirmation = getpass("Confirm password: ")
    except (EOFError, KeyboardInterrupt):
        parser.exit(1, "\nAccount creation cancelled.\n")

    if password != confirmation:
        parser.exit(1, "Passwords do not match.\n")

    try:
        user = create_user(
            username=arguments.username,
            display_name=arguments.display_name,
            password=password,
            role=arguments.role,
        )
    except (ValueError, UsernameAlreadyExistsError) as error:
        parser.exit(1, f"{error}\n")
    except UserRepositoryError:
        parser.exit(
            1,
            "Account creation failed. Check database availability.\n",
        )

    print(
        f"Created account: {user.username} "
        f"(role: {user.role})"
    )


if __name__ == "__main__":
    main()