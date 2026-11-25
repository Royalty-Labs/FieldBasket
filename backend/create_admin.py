from getpass import getpass

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import User


def main():
    print("FieldBasket — Create Administrator")
    full_name = input("Administrator full name: ").strip()
    email = input("Administrator email: ").strip().lower()
    password = getpass("Administrator password (hidden): ")
    confirm_password = getpass("Confirm password (hidden): ")

    if len(full_name) < 2:
        print("Error: enter a valid full name.")
        return

    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        print("Error: enter a valid email address.")
        return

    if len(password) < 12:
        print("Error: use a password with at least 12 characters.")
        return

    if password != confirm_password:
        print("Error: passwords do not match.")
        return

    with SessionLocal() as db:
        existing_user = db.scalar(
            select(User).where(User.email == email)
        )

        if existing_user:
            print(
                "Error: this email already exists. "
                "No account was changed."
            )
            return

        admin = User(
            full_name=full_name,
            email=email,
            password_hash=hash_password(password),
            role="admin",
            is_active=True,
            is_verified=True,
        )

        db.add(admin)
        db.commit()

    print(f"Administrator account created for {email}.")


if __name__ == "__main__":
    main()
