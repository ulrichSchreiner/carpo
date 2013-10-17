package server

import (
	"code.google.com/p/gorest"
	"fmt"
	"net/http"
)

func init() {
	gorest.RegisterService(new(HelloService)) //Register our service
	http.Handle("/rest", gorest.Handle())

}

//Service Definition
type HelloService struct {
	gorest.RestService `root:"/tutorial/" produces:"application/json"`
	helloWorld         gorest.EndPoint `method:"GET" path:"/hello-world/" output:"string"`
	sayHello           gorest.EndPoint `method:"GET" path:"/hello/{name:string}" output:"string"`
}

func (serv HelloService) HelloWorld() string {
	return "Hello World"
}
func (serv HelloService) SayHello(name string) string {
	return "Hello " + name
}

func Start(port int) {
	http.ListenAndServe(fmt.Sprintf(":%d", port), nil)
}
