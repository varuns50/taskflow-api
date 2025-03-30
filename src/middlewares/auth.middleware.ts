import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export interface AuthRequest extends Request {
  user?: { id: number; username: string };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.accessToken; // Reading token from cookies
  console.log('token :- ',token)
  if (!token) return res.status(403).json({ message: "Access denied. No token provided." });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string, (err: jwt.VerifyErrors | null, user: any) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user as { id: number; username: string }; // Explicitly type `user`
    next();
});
};
