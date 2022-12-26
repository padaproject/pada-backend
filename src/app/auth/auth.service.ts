import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compareSync, genSaltSync, hashSync } from 'bcrypt';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { UsersService } from '../users/users.service';
import { RegisterUserDto } from './dto/register.dto';
import { UserTokenPayloadDto } from './dto/tokenPayload.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  private async generateUserToken(userProps: UserTokenPayloadDto) {
    return this.jwtService.sign(instanceToPlain(userProps));
  }

  async validateUserLogin(email: string, password: string): Promise<any> {
    const possibleUser = await this.usersService.findByEmailWithSensitiveData(
      email,
    );

    if (!possibleUser) return null;

    const validPassword = compareSync(password, possibleUser.password);

    if (!validPassword) return null;

    const userTokenPayload = plainToInstance(
      UserTokenPayloadDto,
      possibleUser,
      { excludeExtraneousValues: true },
    );

    const loggedUserToken = await this.generateUserToken(userTokenPayload);

    return { token: loggedUserToken, ...userTokenPayload };
  }

  async registerUser(userRegisterDto: RegisterUserDto) {
    const newUser = await this.usersService.create(userRegisterDto);
    await this.usersService.sendConfirmationEmail(newUser.id);
    return newUser;
  }
}
